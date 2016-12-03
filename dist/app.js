(function () {
'use strict';

/** Virtual DOM Node */
function VNode(nodeName, attributes, children) {
	/** @type {string|function} */
	this.nodeName = nodeName;

	/** @type {object<string>|undefined} */
	this.attributes = attributes;

	/** @type {array<VNode>|undefined} */
	this.children = children;

	/** Reference to the given key. */
	this.key = attributes && attributes.key;
}

/** Global options
 *	@public
 *	@namespace options {Object}
 */
var options = {

	/** If `true`, `prop` changes trigger synchronous component updates.
	 *	@name syncComponentUpdates
	 *	@type Boolean
	 *	@default true
	 */
	//syncComponentUpdates: true,

	/** Processes all created VNodes.
	 *	@param {VNode} vnode	A newly-created VNode to normalize/process
	 */
	//vnode(vnode) { }

	/** Hook invoked after a component is mounted. */
	// afterMount(component) { }

	/** Hook invoked after the DOM is updated with a component's latest render. */
	// afterUpdate(component) { }

	/** Hook invoked immediately before a component is unmounted. */
	// beforeUnmount(component) { }
};

const stack = [];


/** JSX/hyperscript reviver
*	Benchmarks: https://esbench.com/bench/57ee8f8e330ab09900a1a1a0
 *	@see http://jasonformat.com/wtf-is-jsx
 *	@public
 *  @example
 *  /** @jsx h *\/
 *  import { render, h } from 'preact';
 *  render(<span>foo</span>, document.body);
 */
function h(nodeName, attributes) {
	let children = [],
		lastSimple, child, simple, i;
	for (i=arguments.length; i-- > 2; ) {
		stack.push(arguments[i]);
	}
	if (attributes && attributes.children) {
		if (!stack.length) stack.push(attributes.children);
		delete attributes.children;
	}
	while (stack.length) {
		if ((child = stack.pop()) instanceof Array) {
			for (i=child.length; i--; ) stack.push(child[i]);
		}
		else if (child!=null && child!==false) {
			if (typeof child=='number' || child===true) child = String(child);
			simple = typeof child=='string';
			if (simple && lastSimple) {
				children[children.length-1] += child;
			}
			else {
				children.push(child);
				lastSimple = simple;
			}
		}
	}

	let p = new VNode(nodeName, attributes || undefined, children);

	// if a "vnode hook" is defined, pass every created VNode to it
	if (options.vnode) options.vnode(p);

	return p;
}

/** Copy own-properties from `props` onto `obj`.
 *	@returns obj
 *	@private
 */
function extend(obj, props) {
	if (props) {
		for (let i in props) obj[i] = props[i];
	}
	return obj;
}


/** Fast clone. Note: does not filter out non-own properties.
 *	@see https://esbench.com/bench/56baa34f45df6895002e03b6
 */
function clone(obj) {
	return extend({}, obj);
}


/** Get a deep property value from the given object, expressed in dot-notation.
 *	@private
 */
function delve(obj, key) {
	for (let p=key.split('.'), i=0; i<p.length && obj; i++) {
		obj = obj[p[i]];
	}
	return obj;
}


/** @private is the given object a Function? */
function isFunction(obj) {
	return 'function'===typeof obj;
}


/** @private is the given object a String? */
function isString(obj) {
	return 'string'===typeof obj;
}


/** Convert a hashmap of CSS classes to a space-delimited className string
 *	@private
 */
function hashToClassName(c) {
	let str = '';
	for (let prop in c) {
		if (c[prop]) {
			if (str) str += ' ';
			str += prop;
		}
	}
	return str;
}


/** Just a memoized String#toLowerCase */
let lcCache = {};
const toLowerCase = s => lcCache[s] || (lcCache[s] = s.toLowerCase());


/** Call a function asynchronously, as soon as possible.
 *	@param {Function} callback
 */
let resolved = typeof Promise!=='undefined' && Promise.resolve();
const defer = resolved ? (f => { resolved.then(f); }) : setTimeout;

// render modes

const NO_RENDER = 0;
const SYNC_RENDER = 1;
const FORCE_RENDER = 2;
const ASYNC_RENDER = 3;

const EMPTY = {};

const ATTR_KEY = typeof Symbol!=='undefined' ? Symbol.for('preactattr') : '__preactattr_';

// DOM properties that should NOT have "px" added when numeric
const NON_DIMENSION_PROPS = {
	boxFlex:1, boxFlexGroup:1, columnCount:1, fillOpacity:1, flex:1, flexGrow:1,
	flexPositive:1, flexShrink:1, flexNegative:1, fontWeight:1, lineClamp:1, lineHeight:1,
	opacity:1, order:1, orphans:1, strokeOpacity:1, widows:1, zIndex:1, zoom:1
};

// DOM event types that do not bubble and should be attached via useCapture
const NON_BUBBLING_EVENTS = { blur:1, error:1, focus:1, load:1, resize:1, scroll:1 };

function createLinkedState(component, key, eventPath) {
	let path = key.split('.');
	return function(e) {
		let t = e && e.target || this,
			state = {},
			obj = state,
			v = isString(eventPath) ? delve(e, eventPath) : t.nodeName ? (t.type.match(/^che|rad/) ? t.checked : t.value) : e,
			i = 0;
		for ( ; i<path.length-1; i++) {
			obj = obj[path[i]] || (obj[path[i]] = !i && component.state[path[i]] || {});
		}
		obj[path[i]] = v;
		component.setState(state);
	};
}

let items = [];

function enqueueRender(component) {
	if (!component._dirty && (component._dirty = true) && items.push(component)==1) {
		(options.debounceRendering || defer)(rerender);
	}
}


function rerender() {
	let p, list = items;
	items = [];
	while ( (p = list.pop()) ) {
		if (p._dirty) renderComponent(p);
	}
}

function isFunctionalComponent(vnode) {
	let nodeName = vnode && vnode.nodeName;
	return nodeName && isFunction(nodeName) && !(nodeName.prototype && nodeName.prototype.render);
}



/** Construct a resultant VNode from a VNode referencing a stateless functional component.
 *	@param {VNode} vnode	A VNode with a `nodeName` property that is a reference to a function.
 *	@private
 */
function buildFunctionalComponent(vnode, context) {
	return vnode.nodeName(getNodeProps(vnode), context || EMPTY);
}

function isSameNodeType(node, vnode) {
	if (isString(vnode)) {
		return node instanceof Text;
	}
	if (isString(vnode.nodeName)) {
		return !node._componentConstructor && isNamedNode(node, vnode.nodeName);
	}
	if (isFunction(vnode.nodeName)) {
		return (node._componentConstructor ? node._componentConstructor===vnode.nodeName : true) || isFunctionalComponent(vnode);
	}
}


function isNamedNode(node, nodeName) {
	return node.normalizedNodeName===nodeName || toLowerCase(node.nodeName)===toLowerCase(nodeName);
}


/**
 * Reconstruct Component-style `props` from a VNode.
 * Ensures default/fallback values from `defaultProps`:
 * Own-properties of `defaultProps` not present in `vnode.attributes` are added.
 * @param {VNode} vnode
 * @returns {Object} props
 */
function getNodeProps(vnode) {
	let props = clone(vnode.attributes);
	props.children = vnode.children;

	let defaultProps = vnode.nodeName.defaultProps;
	if (defaultProps) {
		for (let i in defaultProps) {
			if (props[i]===undefined) {
				props[i] = defaultProps[i];
			}
		}
	}

	return props;
}

function removeNode(node) {
	let p = node.parentNode;
	if (p) p.removeChild(node);
}


/** Set a named attribute on the given Node, with special behavior for some names and event handlers.
 *	If `value` is `null`, the attribute/handler will be removed.
 *	@param {Element} node	An element to mutate
 *	@param {string} name	The name/key to set, such as an event or attribute name
 *	@param {any} value		An attribute value, such as a function to be used as an event handler
 *	@param {any} previousValue	The last value that was set for this name/node pair
 *	@private
 */
function setAccessor(node, name, old, value, isSvg) {

	if (name==='className') name = 'class';

	if (name==='class' && value && typeof value==='object') {
		value = hashToClassName(value);
	}

	if (name==='key') {
		// ignore
	}
	else if (name==='class' && !isSvg) {
		node.className = value || '';
	}
	else if (name==='style') {
		if (!value || isString(value) || isString(old)) {
			node.style.cssText = value || '';
		}
		if (value && typeof value==='object') {
			if (!isString(old)) {
				for (let i in old) if (!(i in value)) node.style[i] = '';
			}
			for (let i in value) {
				node.style[i] = typeof value[i]==='number' && !NON_DIMENSION_PROPS[i] ? (value[i]+'px') : value[i];
			}
		}
	}
	else if (name==='dangerouslySetInnerHTML') {
		node.innerHTML = value && value.__html || '';
	}
	else if (name[0]=='o' && name[1]=='n') {
		let l = node._listeners || (node._listeners = {});
		name = toLowerCase(name.substring(2));
		// @TODO: this might be worth it later, un-breaks focus/blur bubbling in IE9:
		// if (node.attachEvent) name = name=='focus'?'focusin':name=='blur'?'focusout':name;
		if (value) {
			if (!l[name]) node.addEventListener(name, eventProxy, !!NON_BUBBLING_EVENTS[name]);
		}
		else if (l[name]) {
			node.removeEventListener(name, eventProxy, !!NON_BUBBLING_EVENTS[name]);
		}
		l[name] = value;
	}
	else if (name!=='list' && name!=='type' && !isSvg && name in node) {
		setProperty(node, name, value==null ? '' : value);
		if (value==null || value===false) node.removeAttribute(name);
	}
	else {
		let ns = isSvg && name.match(/^xlink\:?(.+)/);
		if (value==null || value===false) {
			if (ns) node.removeAttributeNS('http://www.w3.org/1999/xlink', toLowerCase(ns[1]));
			else node.removeAttribute(name);
		}
		else if (typeof value!=='object' && !isFunction(value)) {
			if (ns) node.setAttributeNS('http://www.w3.org/1999/xlink', toLowerCase(ns[1]), value);
			else node.setAttribute(name, value);
		}
	}
}


/** Attempt to set a DOM property to the given value.
 *	IE & FF throw for certain property-value combinations.
 */
function setProperty(node, name, value) {
	try {
		node[name] = value;
	} catch (e) { }
}


/** Proxy an event to hooked event handlers
 *	@private
 */
function eventProxy(e) {
	return this._listeners[e.type](options.event && options.event(e) || e);
}

const nodes = {};

function collectNode(node) {
	removeNode(node);

	if (node instanceof Element) {
		node._component = node._componentConstructor = null;

		let name = node.normalizedNodeName || toLowerCase(node.nodeName);
		(nodes[name] || (nodes[name] = [])).push(node);
	}
}


function createNode(nodeName, isSvg) {
	let name = toLowerCase(nodeName),
		node = nodes[name] && nodes[name].pop() || (isSvg ? document.createElementNS('http://www.w3.org/2000/svg', nodeName) : document.createElement(nodeName));
	node.normalizedNodeName = name;
	return node;
}

const mounts = [];

/** Diff recursion count, used to track the end of the diff cycle. */
let diffLevel = 0;

/** Global flag indicating if the diff is currently within an SVG */
let isSvgMode = false;

/** Global flag indicating if the diff is performing hydration */
let hydrating = false;


/** Invoke queued componentDidMount lifecycle methods */
function flushMounts() {
	let c;
	while ((c=mounts.pop())) {
		if (options.afterMount) options.afterMount(c);
		if (c.componentDidMount) c.componentDidMount();
	}
}


/** Apply differences in a given vnode (and it's deep children) to a real DOM Node.
 *	@param {Element} [dom=null]		A DOM node to mutate into the shape of the `vnode`
 *	@param {VNode} vnode			A VNode (with descendants forming a tree) representing the desired DOM structure
 *	@returns {Element} dom			The created/mutated element
 *	@private
 */
function diff(dom, vnode, context, mountAll, parent, componentRoot) {
	// diffLevel having been 0 here indicates initial entry into the diff (not a subdiff)
	if (!diffLevel++) {
		// when first starting the diff, check if we're diffing an SVG or within an SVG
		isSvgMode = parent instanceof SVGElement;

		// hydration is inidicated by the existing element to be diffed not having a prop cache
		hydrating = dom && !(ATTR_KEY in dom);
	}

	let ret = idiff(dom, vnode, context, mountAll);

	// append the element if its a new parent
	if (parent && ret.parentNode!==parent) parent.appendChild(ret);

	// diffLevel being reduced to 0 means we're exiting the diff
	if (!--diffLevel) {
		hydrating = false;
		// invoke queued componentDidMount lifecycle methods
		if (!componentRoot) flushMounts();
	}

	return ret;
}


function idiff(dom, vnode, context, mountAll) {
	let originalAttributes = vnode && vnode.attributes;


	// Resolve ephemeral Pure Functional Components
	while (isFunctionalComponent(vnode)) {
		vnode = buildFunctionalComponent(vnode, context);
	}


	// empty values (null & undefined) render as empty Text nodes
	if (vnode==null) vnode = '';


	// Fast case: Strings create/update Text nodes.
	if (isString(vnode)) {
		// update if it's already a Text node
		if (dom && dom instanceof Text) {
			if (dom.nodeValue!=vnode) {
				dom.nodeValue = vnode;
			}
		}
		else {
			// it wasn't a Text node: replace it with one and recycle the old Element
			if (dom) recollectNodeTree(dom);
			dom = document.createTextNode(vnode);
		}

		// Mark for non-hydration updates
		dom[ATTR_KEY] = true;
		return dom;
	}


	// If the VNode represents a Component, perform a component diff.
	if (isFunction(vnode.nodeName)) {
		return buildComponentFromVNode(dom, vnode, context, mountAll);
	}


	let out = dom,
		nodeName = String(vnode.nodeName),	// @TODO this masks undefined component errors as `<undefined>`
		prevSvgMode = isSvgMode,
		vchildren = vnode.children;


	// SVGs have special namespace stuff.
	// This tracks entering and exiting that namespace when descending through the tree.
	isSvgMode = nodeName==='svg' ? true : nodeName==='foreignObject' ? false : isSvgMode;


	if (!dom) {
		// case: we had no element to begin with
		// - create an element to with the nodeName from VNode
		out = createNode(nodeName, isSvgMode);
	}
	else if (!isNamedNode(dom, nodeName)) {
		// case: Element and VNode had different nodeNames
		// - need to create the correct Element to match VNode
		// - then migrate children from old to new

		out = createNode(nodeName, isSvgMode);

		// move children into the replacement node
		while (dom.firstChild) out.appendChild(dom.firstChild);

		// if the previous Element was mounted into the DOM, replace it inline
		if (dom.parentNode) dom.parentNode.replaceChild(out, dom);

		// recycle the old element (skips non-Element node types)
		recollectNodeTree(dom);
	}


	let fc = out.firstChild,
		props = out[ATTR_KEY];

	// Attribute Hydration: if there is no prop cache on the element,
	// ...create it and populate it with the element's attributes.
	if (!props) {
		out[ATTR_KEY] = props = {};
		for (let a=out.attributes, i=a.length; i--; ) props[a[i].name] = a[i].value;
	}

	// Apply attributes/props from VNode to the DOM Element:
	diffAttributes(out, vnode.attributes, props);


	// Optimization: fast-path for elements containing a single TextNode:
	if (!hydrating && vchildren && vchildren.length===1 && typeof vchildren[0]==='string' && fc && fc instanceof Text && !fc.nextSibling) {
		if (fc.nodeValue!=vchildren[0]) {
			fc.nodeValue = vchildren[0];
		}
	}
	// otherwise, if there are existing or new children, diff them:
	else if (vchildren && vchildren.length || fc) {
		innerDiffNode(out, vchildren, context, mountAll);
	}


	// invoke original ref (from before resolving Pure Functional Components):
	if (originalAttributes && typeof originalAttributes.ref==='function') {
		(props.ref = originalAttributes.ref)(out);
	}

	isSvgMode = prevSvgMode;

	return out;
}


/** Apply child and attribute changes between a VNode and a DOM Node to the DOM.
 *	@param {Element} dom		Element whose children should be compared & mutated
 *	@param {Array} vchildren	Array of VNodes to compare to `dom.childNodes`
 *	@param {Object} context		Implicitly descendant context object (from most recent `getChildContext()`)
 *	@param {Boolean} moutAll
 */
function innerDiffNode(dom, vchildren, context, mountAll) {
	let originalChildren = dom.childNodes,
		children = [],
		keyed = {},
		keyedLen = 0,
		min = 0,
		len = originalChildren.length,
		childrenLen = 0,
		vlen = vchildren && vchildren.length,
		j, c, vchild, child;

	if (len) {
		for (let i=0; i<len; i++) {
			let child = originalChildren[i],
				props = child[ATTR_KEY],
				key = vlen ? ((c = child._component) ? c.__key : props ? props.key : null) : null;
			if (key!=null) {
				keyedLen++;
				keyed[key] = child;
			}
			else if (hydrating || props) {
				children[childrenLen++] = child;
			}
		}
	}

	if (vlen) {
		for (let i=0; i<vlen; i++) {
			vchild = vchildren[i];
			child = null;

			// if (isFunctionalComponent(vchild)) {
			// 	vchild = buildFunctionalComponent(vchild);
			// }

			// attempt to find a node based on key matching
			let key = vchild.key;
			if (key!=null) {
				if (keyedLen && key in keyed) {
					child = keyed[key];
					keyed[key] = undefined;
					keyedLen--;
				}
			}
			// attempt to pluck a node of the same type from the existing children
			else if (!child && min<childrenLen) {
				for (j=min; j<childrenLen; j++) {
					c = children[j];
					if (c && isSameNodeType(c, vchild)) {
						child = c;
						children[j] = undefined;
						if (j===childrenLen-1) childrenLen--;
						if (j===min) min++;
						break;
					}
				}
			}

			// morph the matched/found/created DOM child to match vchild (deep)
			child = idiff(child, vchild, context, mountAll);

			if (child && child!==dom) {
				if (i>=len) {
					dom.appendChild(child);
				}
				else if (child!==originalChildren[i]) {
					if (child===originalChildren[i+1]) {
						removeNode(originalChildren[i]);
					}
					dom.insertBefore(child, originalChildren[i] || null);
				}
			}
		}
	}


	if (keyedLen) {
		for (let i in keyed) if (keyed[i]) recollectNodeTree(keyed[i]);
	}

	// remove orphaned children
	while (min<=childrenLen) {
		child = children[childrenLen--];
		if (child) recollectNodeTree(child);
	}
}



/** Recursively recycle (or just unmount) a node an its descendants.
 *	@param {Node} node						DOM node to start unmount/removal from
 *	@param {Boolean} [unmountOnly=false]	If `true`, only triggers unmount lifecycle, skips removal
 */
function recollectNodeTree(node, unmountOnly) {
	let component = node._component;
	if (component) {
		// if node is owned by a Component, unmount that component (ends up recursing back here)
		unmountComponent(component, !unmountOnly);
	}
	else {
		// If the node's VNode had a ref function, invoke it with null here.
		// (this is part of the React spec, and smart for unsetting references)
		if (node[ATTR_KEY] && node[ATTR_KEY].ref) node[ATTR_KEY].ref(null);

		if (!unmountOnly) {
			collectNode(node);
		}

		// Recollect/unmount all children.
		// - we use .lastChild here because it causes less reflow than .firstChild
		// - it's also cheaper than accessing the .childNodes Live NodeList
		let c;
		while ((c=node.lastChild)) recollectNodeTree(c, unmountOnly);
	}
}



/** Apply differences in attributes from a VNode to the given DOM Element.
 *	@param {Element} dom		Element with attributes to diff `attrs` against
 *	@param {Object} attrs		The desired end-state key-value attribute pairs
 *	@param {Object} old			Current/previous attributes (from previous VNode or element's prop cache)
 */
function diffAttributes(dom, attrs, old) {
	// remove attributes no longer present on the vnode by setting them to undefined
	for (let name in old) {
		if (!(attrs && name in attrs) && old[name]!=null) {
			setAccessor(dom, name, old[name], old[name] = undefined, isSvgMode);
		}
	}

	// add new & update changed attributes
	if (attrs) {
		for (let name in attrs) {
			if (name!=='children' && name!=='innerHTML' && (!(name in old) || attrs[name]!==(name==='value' || name==='checked' ? dom[name] : old[name]))) {
				setAccessor(dom, name, old[name], old[name] = attrs[name], isSvgMode);
			}
		}
	}
}

const components = {};


function collectComponent(component) {
	let name = component.constructor.name,
		list = components[name];
	if (list) list.push(component);
	else components[name] = [component];
}


function createComponent(Ctor, props, context) {
	let inst = new Ctor(props, context),
		list = components[Ctor.name];
	Component.call(inst, props, context);
	if (list) {
		for (let i=list.length; i--; ) {
			if (list[i].constructor===Ctor) {
				inst.nextBase = list[i].nextBase;
				list.splice(i, 1);
				break;
			}
		}
	}
	return inst;
}

function setComponentProps(component, props, opts, context, mountAll) {
	if (component._disable) return;
	component._disable = true;

	if ((component.__ref = props.ref)) delete props.ref;
	if ((component.__key = props.key)) delete props.key;

	if (!component.base || mountAll) {
		if (component.componentWillMount) component.componentWillMount();
	}
	else if (component.componentWillReceiveProps) {
		component.componentWillReceiveProps(props, context);
	}

	if (context && context!==component.context) {
		if (!component.prevContext) component.prevContext = component.context;
		component.context = context;
	}

	if (!component.prevProps) component.prevProps = component.props;
	component.props = props;

	component._disable = false;

	if (opts!==NO_RENDER) {
		if (opts===SYNC_RENDER || options.syncComponentUpdates!==false || !component.base) {
			renderComponent(component, SYNC_RENDER, mountAll);
		}
		else {
			enqueueRender(component);
		}
	}

	if (component.__ref) component.__ref(component);
}



/** Render a Component, triggering necessary lifecycle events and taking High-Order Components into account.
 *	@param {Component} component
 *	@param {Object} [opts]
 *	@param {boolean} [opts.build=false]		If `true`, component will build and store a DOM node if not already associated with one.
 *	@private
 */
function renderComponent(component, opts, mountAll, isChild) {
	if (component._disable) return;

	let skip, rendered,
		props = component.props,
		state = component.state,
		context = component.context,
		previousProps = component.prevProps || props,
		previousState = component.prevState || state,
		previousContext = component.prevContext || context,
		isUpdate = component.base,
		nextBase = component.nextBase,
		initialBase = isUpdate || nextBase,
		initialChildComponent = component._component,
		inst, cbase;

	// if updating
	if (isUpdate) {
		component.props = previousProps;
		component.state = previousState;
		component.context = previousContext;
		if (opts!==FORCE_RENDER
			&& component.shouldComponentUpdate
			&& component.shouldComponentUpdate(props, state, context) === false) {
			skip = true;
		}
		else if (component.componentWillUpdate) {
			component.componentWillUpdate(props, state, context);
		}
		component.props = props;
		component.state = state;
		component.context = context;
	}

	component.prevProps = component.prevState = component.prevContext = component.nextBase = null;
	component._dirty = false;

	if (!skip) {
		if (component.render) rendered = component.render(props, state, context);

		// context to pass to the child, can be updated via (grand-)parent component
		if (component.getChildContext) {
			context = extend(clone(context), component.getChildContext());
		}

		while (isFunctionalComponent(rendered)) {
			rendered = buildFunctionalComponent(rendered, context);
		}

		let childComponent = rendered && rendered.nodeName,
			toUnmount, base;

		if (isFunction(childComponent)) {
			// set up high order component link

			let childProps = getNodeProps(rendered);
			inst = initialChildComponent;

			if (inst && inst.constructor===childComponent && childProps.key==inst.__key) {
				setComponentProps(inst, childProps, SYNC_RENDER, context);
			}
			else {
				toUnmount = inst;

				inst = createComponent(childComponent, childProps, context);
				inst.nextBase = inst.nextBase || nextBase;
				inst._parentComponent = component;
				component._component = inst;
				setComponentProps(inst, childProps, NO_RENDER, context);
				renderComponent(inst, SYNC_RENDER, mountAll, true);
			}

			base = inst.base;
		}
		else {
			cbase = initialBase;

			// destroy high order component link
			toUnmount = initialChildComponent;
			if (toUnmount) {
				cbase = component._component = null;
			}

			if (initialBase || opts===SYNC_RENDER) {
				if (cbase) cbase._component = null;
				base = diff(cbase, rendered, context, mountAll || !isUpdate, initialBase && initialBase.parentNode, true);
			}
		}

		if (initialBase && base!==initialBase && inst!==initialChildComponent) {
			let baseParent = initialBase.parentNode;
			if (baseParent && base!==baseParent) {
				baseParent.replaceChild(base, initialBase);

				if (!toUnmount) {
					initialBase._component = null;
					recollectNodeTree(initialBase);
				}
			}
		}

		if (toUnmount) {
			unmountComponent(toUnmount, base!==initialBase);
		}

		component.base = base;
		if (base && !isChild) {
			let componentRef = component,
				t = component;
			while ((t=t._parentComponent)) {
				(componentRef = t).base = base;
			}
			base._component = componentRef;
			base._componentConstructor = componentRef.constructor;
		}
	}

	if (!isUpdate || mountAll) {
		mounts.unshift(component);
	}
	else if (!skip) {
		if (component.componentDidUpdate) {
			component.componentDidUpdate(previousProps, previousState, previousContext);
		}
		if (options.afterUpdate) options.afterUpdate(component);
	}

	let cb = component._renderCallbacks, fn;
	if (cb) while ( (fn = cb.pop()) ) fn.call(component);

	if (!diffLevel && !isChild) flushMounts();
}



/** Apply the Component referenced by a VNode to the DOM.
 *	@param {Element} dom	The DOM node to mutate
 *	@param {VNode} vnode	A Component-referencing VNode
 *	@returns {Element} dom	The created/mutated element
 *	@private
 */
function buildComponentFromVNode(dom, vnode, context, mountAll) {
	let c = dom && dom._component,
		oldDom = dom,
		isDirectOwner = c && dom._componentConstructor===vnode.nodeName,
		isOwner = isDirectOwner,
		props = getNodeProps(vnode);
	while (c && !isOwner && (c=c._parentComponent)) {
		isOwner = c.constructor===vnode.nodeName;
	}

	if (c && isOwner && (!mountAll || c._component)) {
		setComponentProps(c, props, ASYNC_RENDER, context, mountAll);
		dom = c.base;
	}
	else {
		if (c && !isDirectOwner) {
			unmountComponent(c, true);
			dom = oldDom = null;
		}

		c = createComponent(vnode.nodeName, props, context);
		if (dom && !c.nextBase) {
			c.nextBase = dom;
			// passing dom/oldDom as nextBase will recycle it if unused, so bypass recycling on L241:
			oldDom = null;
		}
		setComponentProps(c, props, SYNC_RENDER, context, mountAll);
		dom = c.base;

		if (oldDom && dom!==oldDom) {
			oldDom._component = null;
			recollectNodeTree(oldDom);
		}
	}

	return dom;
}



/** Remove a component from the DOM and recycle it.
 *	@param {Element} dom			A DOM node from which to unmount the given Component
 *	@param {Component} component	The Component instance to unmount
 *	@private
 */
function unmountComponent(component, remove) {
	if (options.beforeUnmount) options.beforeUnmount(component);

	// console.log(`${remove?'Removing':'Unmounting'} component: ${component.constructor.name}`);
	let base = component.base;

	component._disable = true;

	if (component.componentWillUnmount) component.componentWillUnmount();

	component.base = null;

	// recursively tear down & recollect high-order component children:
	let inner = component._component;
	if (inner) {
		unmountComponent(inner, remove);
	}
	else if (base) {
		if (base[ATTR_KEY] && base[ATTR_KEY].ref) base[ATTR_KEY].ref(null);

		component.nextBase = base;

		if (remove) {
			removeNode(base);
			collectComponent(component);
		}
		let c;
		while ((c=base.lastChild)) recollectNodeTree(c, !remove);
		// removeOrphanedChildren(base.childNodes, true);
	}

	if (component.__ref) component.__ref(null);
	if (component.componentDidUnmount) component.componentDidUnmount();
}

function Component(props, context) {
	/** @private */
	this._dirty = true;
	// /** @public */
	// this._disableRendering = false;
	// /** @public */
	// this.prevState = this.prevProps = this.prevContext = this.base = this.nextBase = this._parentComponent = this._component = this.__ref = this.__key = this._linkedStates = this._renderCallbacks = null;
	/** @public */
	this.context = context;
	/** @type {object} */
	this.props = props;
	/** @type {object} */
	if (!this.state) this.state = {};
}


extend(Component.prototype, {

	/** Returns a `boolean` value indicating if the component should re-render when receiving the given `props` and `state`.
	 *	@param {object} nextProps
	 *	@param {object} nextState
	 *	@param {object} nextContext
	 *	@returns {Boolean} should the component re-render
	 *	@name shouldComponentUpdate
	 *	@function
	 */
	// shouldComponentUpdate() {
	// 	return true;
	// },


	/** Returns a function that sets a state property when called.
	 *	Calling linkState() repeatedly with the same arguments returns a cached link function.
	 *
	 *	Provides some built-in special cases:
	 *		- Checkboxes and radio buttons link their boolean `checked` value
	 *		- Inputs automatically link their `value` property
	 *		- Event paths fall back to any associated Component if not found on an element
	 *		- If linked value is a function, will invoke it and use the result
	 *
	 *	@param {string} key				The path to set - can be a dot-notated deep key
	 *	@param {string} [eventPath]		If set, attempts to find the new state value at a given dot-notated path within the object passed to the linkedState setter.
	 *	@returns {function} linkStateSetter(e)
	 *
	 *	@example Update a "text" state value when an input changes:
	 *		<input onChange={ this.linkState('text') } />
	 *
	 *	@example Set a deep state value on click
	 *		<button onClick={ this.linkState('touch.coords', 'touches.0') }>Tap</button
	 */
	linkState(key, eventPath) {
		let c = this._linkedStates || (this._linkedStates = {});
		return c[key+eventPath] || (c[key+eventPath] = createLinkedState(this, key, eventPath));
	},


	/** Update component state by copying properties from `state` to `this.state`.
	 *	@param {object} state		A hash of state properties to update with new values
	 */
	setState(state, callback) {
		let s = this.state;
		if (!this.prevState) this.prevState = clone(s);
		extend(s, isFunction(state) ? state(s, this.props) : state);
		if (callback) (this._renderCallbacks = (this._renderCallbacks || [])).push(callback);
		enqueueRender(this);
	},


	/** Immediately perform a synchronous re-render of the component.
	 *	@private
	 */
	forceUpdate() {
		renderComponent(this, FORCE_RENDER);
	},


	/** Accepts `props` and `state`, and returns a new Virtual DOM tree to build.
	 *	Virtual DOM is generally constructed via [JSX](http://jasonformat.com/wtf-is-jsx).
	 *	@param {object} props		Props (eg: JSX attributes) received from parent element/component
	 *	@param {object} state		The component's current state
	 *	@param {object} context		Context object (if a parent component has provided context)
	 *	@returns VNode
	 */
	render() {}

});

function render(vnode, parent, merge) {
	return diff(merge, vnode, {}, false, parent);
}

function onDomReady(func) {
  if (['complete', 'loaded', 'interactive'].indexOf(document.readyState) > -1) {
    func();
  } else {
    document.addEventListener('DOMContentLoaded', func);
  }
}

onDomReady(function () {
    render(h(
        'div',
        { id: 'foo' },
        h(
            'span',
            null,
            'Hello, world!'
        ),
        h(
            'button',
            { onClick: function onClick(e) {
                    return alert("hey!");
                } },
            'Click Me'
        )
    ), document.getElementById('app'));
});

}());
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjpudWxsLCJzb3VyY2VzIjpbIi4uL25vZGVfbW9kdWxlcy9wcmVhY3Qvc3JjL3Zub2RlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3ByZWFjdC9zcmMvb3B0aW9ucy5qcyIsIi4uL25vZGVfbW9kdWxlcy9wcmVhY3Qvc3JjL2guanMiLCIuLi9ub2RlX21vZHVsZXMvcHJlYWN0L3NyYy91dGlsLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3ByZWFjdC9zcmMvY29uc3RhbnRzLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3ByZWFjdC9zcmMvbGlua2VkLXN0YXRlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3ByZWFjdC9zcmMvcmVuZGVyLXF1ZXVlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3ByZWFjdC9zcmMvdmRvbS9mdW5jdGlvbmFsLWNvbXBvbmVudC5qcyIsIi4uL25vZGVfbW9kdWxlcy9wcmVhY3Qvc3JjL3Zkb20vaW5kZXguanMiLCIuLi9ub2RlX21vZHVsZXMvcHJlYWN0L3NyYy9kb20vaW5kZXguanMiLCIuLi9ub2RlX21vZHVsZXMvcHJlYWN0L3NyYy9kb20vcmVjeWNsZXIuanMiLCIuLi9ub2RlX21vZHVsZXMvcHJlYWN0L3NyYy92ZG9tL2RpZmYuanMiLCIuLi9ub2RlX21vZHVsZXMvcHJlYWN0L3NyYy92ZG9tL2NvbXBvbmVudC1yZWN5Y2xlci5qcyIsIi4uL25vZGVfbW9kdWxlcy9wcmVhY3Qvc3JjL3Zkb20vY29tcG9uZW50LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3ByZWFjdC9zcmMvY29tcG9uZW50LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3ByZWFjdC9zcmMvcmVuZGVyLmpzIiwiLi4vc3JjL2FwcC9yZWFkeS5qcyIsIi4uL3NyYy9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiogVmlydHVhbCBET00gTm9kZSAqL1xuZXhwb3J0IGZ1bmN0aW9uIFZOb2RlKG5vZGVOYW1lLCBhdHRyaWJ1dGVzLCBjaGlsZHJlbikge1xuXHQvKiogQHR5cGUge3N0cmluZ3xmdW5jdGlvbn0gKi9cblx0dGhpcy5ub2RlTmFtZSA9IG5vZGVOYW1lO1xuXG5cdC8qKiBAdHlwZSB7b2JqZWN0PHN0cmluZz58dW5kZWZpbmVkfSAqL1xuXHR0aGlzLmF0dHJpYnV0ZXMgPSBhdHRyaWJ1dGVzO1xuXG5cdC8qKiBAdHlwZSB7YXJyYXk8Vk5vZGU+fHVuZGVmaW5lZH0gKi9cblx0dGhpcy5jaGlsZHJlbiA9IGNoaWxkcmVuO1xuXG5cdC8qKiBSZWZlcmVuY2UgdG8gdGhlIGdpdmVuIGtleS4gKi9cblx0dGhpcy5rZXkgPSBhdHRyaWJ1dGVzICYmIGF0dHJpYnV0ZXMua2V5O1xufVxuIiwiLyoqIEdsb2JhbCBvcHRpb25zXG4gKlx0QHB1YmxpY1xuICpcdEBuYW1lc3BhY2Ugb3B0aW9ucyB7T2JqZWN0fVxuICovXG5leHBvcnQgZGVmYXVsdCB7XG5cblx0LyoqIElmIGB0cnVlYCwgYHByb3BgIGNoYW5nZXMgdHJpZ2dlciBzeW5jaHJvbm91cyBjb21wb25lbnQgdXBkYXRlcy5cblx0ICpcdEBuYW1lIHN5bmNDb21wb25lbnRVcGRhdGVzXG5cdCAqXHRAdHlwZSBCb29sZWFuXG5cdCAqXHRAZGVmYXVsdCB0cnVlXG5cdCAqL1xuXHQvL3N5bmNDb21wb25lbnRVcGRhdGVzOiB0cnVlLFxuXG5cdC8qKiBQcm9jZXNzZXMgYWxsIGNyZWF0ZWQgVk5vZGVzLlxuXHQgKlx0QHBhcmFtIHtWTm9kZX0gdm5vZGVcdEEgbmV3bHktY3JlYXRlZCBWTm9kZSB0byBub3JtYWxpemUvcHJvY2Vzc1xuXHQgKi9cblx0Ly92bm9kZSh2bm9kZSkgeyB9XG5cblx0LyoqIEhvb2sgaW52b2tlZCBhZnRlciBhIGNvbXBvbmVudCBpcyBtb3VudGVkLiAqL1xuXHQvLyBhZnRlck1vdW50KGNvbXBvbmVudCkgeyB9XG5cblx0LyoqIEhvb2sgaW52b2tlZCBhZnRlciB0aGUgRE9NIGlzIHVwZGF0ZWQgd2l0aCBhIGNvbXBvbmVudCdzIGxhdGVzdCByZW5kZXIuICovXG5cdC8vIGFmdGVyVXBkYXRlKGNvbXBvbmVudCkgeyB9XG5cblx0LyoqIEhvb2sgaW52b2tlZCBpbW1lZGlhdGVseSBiZWZvcmUgYSBjb21wb25lbnQgaXMgdW5tb3VudGVkLiAqL1xuXHQvLyBiZWZvcmVVbm1vdW50KGNvbXBvbmVudCkgeyB9XG59O1xuIiwiaW1wb3J0IHsgVk5vZGUgfSBmcm9tICcuL3Zub2RlJztcbmltcG9ydCBvcHRpb25zIGZyb20gJy4vb3B0aW9ucyc7XG5cblxuY29uc3Qgc3RhY2sgPSBbXTtcblxuXG4vKiogSlNYL2h5cGVyc2NyaXB0IHJldml2ZXJcbipcdEJlbmNobWFya3M6IGh0dHBzOi8vZXNiZW5jaC5jb20vYmVuY2gvNTdlZThmOGUzMzBhYjA5OTAwYTFhMWEwXG4gKlx0QHNlZSBodHRwOi8vamFzb25mb3JtYXQuY29tL3d0Zi1pcy1qc3hcbiAqXHRAcHVibGljXG4gKiAgQGV4YW1wbGVcbiAqICAvKiogQGpzeCBoICpcXC9cbiAqICBpbXBvcnQgeyByZW5kZXIsIGggfSBmcm9tICdwcmVhY3QnO1xuICogIHJlbmRlcig8c3Bhbj5mb288L3NwYW4+LCBkb2N1bWVudC5ib2R5KTtcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGgobm9kZU5hbWUsIGF0dHJpYnV0ZXMpIHtcblx0bGV0IGNoaWxkcmVuID0gW10sXG5cdFx0bGFzdFNpbXBsZSwgY2hpbGQsIHNpbXBsZSwgaTtcblx0Zm9yIChpPWFyZ3VtZW50cy5sZW5ndGg7IGktLSA+IDI7ICkge1xuXHRcdHN0YWNrLnB1c2goYXJndW1lbnRzW2ldKTtcblx0fVxuXHRpZiAoYXR0cmlidXRlcyAmJiBhdHRyaWJ1dGVzLmNoaWxkcmVuKSB7XG5cdFx0aWYgKCFzdGFjay5sZW5ndGgpIHN0YWNrLnB1c2goYXR0cmlidXRlcy5jaGlsZHJlbik7XG5cdFx0ZGVsZXRlIGF0dHJpYnV0ZXMuY2hpbGRyZW47XG5cdH1cblx0d2hpbGUgKHN0YWNrLmxlbmd0aCkge1xuXHRcdGlmICgoY2hpbGQgPSBzdGFjay5wb3AoKSkgaW5zdGFuY2VvZiBBcnJheSkge1xuXHRcdFx0Zm9yIChpPWNoaWxkLmxlbmd0aDsgaS0tOyApIHN0YWNrLnB1c2goY2hpbGRbaV0pO1xuXHRcdH1cblx0XHRlbHNlIGlmIChjaGlsZCE9bnVsbCAmJiBjaGlsZCE9PWZhbHNlKSB7XG5cdFx0XHRpZiAodHlwZW9mIGNoaWxkPT0nbnVtYmVyJyB8fCBjaGlsZD09PXRydWUpIGNoaWxkID0gU3RyaW5nKGNoaWxkKTtcblx0XHRcdHNpbXBsZSA9IHR5cGVvZiBjaGlsZD09J3N0cmluZyc7XG5cdFx0XHRpZiAoc2ltcGxlICYmIGxhc3RTaW1wbGUpIHtcblx0XHRcdFx0Y2hpbGRyZW5bY2hpbGRyZW4ubGVuZ3RoLTFdICs9IGNoaWxkO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2goY2hpbGQpO1xuXHRcdFx0XHRsYXN0U2ltcGxlID0gc2ltcGxlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGxldCBwID0gbmV3IFZOb2RlKG5vZGVOYW1lLCBhdHRyaWJ1dGVzIHx8IHVuZGVmaW5lZCwgY2hpbGRyZW4pO1xuXG5cdC8vIGlmIGEgXCJ2bm9kZSBob29rXCIgaXMgZGVmaW5lZCwgcGFzcyBldmVyeSBjcmVhdGVkIFZOb2RlIHRvIGl0XG5cdGlmIChvcHRpb25zLnZub2RlKSBvcHRpb25zLnZub2RlKHApO1xuXG5cdHJldHVybiBwO1xufVxuIiwiLyoqIENvcHkgb3duLXByb3BlcnRpZXMgZnJvbSBgcHJvcHNgIG9udG8gYG9iamAuXG4gKlx0QHJldHVybnMgb2JqXG4gKlx0QHByaXZhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV4dGVuZChvYmosIHByb3BzKSB7XG5cdGlmIChwcm9wcykge1xuXHRcdGZvciAobGV0IGkgaW4gcHJvcHMpIG9ialtpXSA9IHByb3BzW2ldO1xuXHR9XG5cdHJldHVybiBvYmo7XG59XG5cblxuLyoqIEZhc3QgY2xvbmUuIE5vdGU6IGRvZXMgbm90IGZpbHRlciBvdXQgbm9uLW93biBwcm9wZXJ0aWVzLlxuICpcdEBzZWUgaHR0cHM6Ly9lc2JlbmNoLmNvbS9iZW5jaC81NmJhYTM0ZjQ1ZGY2ODk1MDAyZTAzYjZcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNsb25lKG9iaikge1xuXHRyZXR1cm4gZXh0ZW5kKHt9LCBvYmopO1xufVxuXG5cbi8qKiBHZXQgYSBkZWVwIHByb3BlcnR5IHZhbHVlIGZyb20gdGhlIGdpdmVuIG9iamVjdCwgZXhwcmVzc2VkIGluIGRvdC1ub3RhdGlvbi5cbiAqXHRAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gZGVsdmUob2JqLCBrZXkpIHtcblx0Zm9yIChsZXQgcD1rZXkuc3BsaXQoJy4nKSwgaT0wOyBpPHAubGVuZ3RoICYmIG9iajsgaSsrKSB7XG5cdFx0b2JqID0gb2JqW3BbaV1dO1xuXHR9XG5cdHJldHVybiBvYmo7XG59XG5cblxuLyoqIEBwcml2YXRlIGlzIHRoZSBnaXZlbiBvYmplY3QgYSBGdW5jdGlvbj8gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0Z1bmN0aW9uKG9iaikge1xuXHRyZXR1cm4gJ2Z1bmN0aW9uJz09PXR5cGVvZiBvYmo7XG59XG5cblxuLyoqIEBwcml2YXRlIGlzIHRoZSBnaXZlbiBvYmplY3QgYSBTdHJpbmc/ICovXG5leHBvcnQgZnVuY3Rpb24gaXNTdHJpbmcob2JqKSB7XG5cdHJldHVybiAnc3RyaW5nJz09PXR5cGVvZiBvYmo7XG59XG5cblxuLyoqIENvbnZlcnQgYSBoYXNobWFwIG9mIENTUyBjbGFzc2VzIHRvIGEgc3BhY2UtZGVsaW1pdGVkIGNsYXNzTmFtZSBzdHJpbmdcbiAqXHRAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gaGFzaFRvQ2xhc3NOYW1lKGMpIHtcblx0bGV0IHN0ciA9ICcnO1xuXHRmb3IgKGxldCBwcm9wIGluIGMpIHtcblx0XHRpZiAoY1twcm9wXSkge1xuXHRcdFx0aWYgKHN0cikgc3RyICs9ICcgJztcblx0XHRcdHN0ciArPSBwcm9wO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gc3RyO1xufVxuXG5cbi8qKiBKdXN0IGEgbWVtb2l6ZWQgU3RyaW5nI3RvTG93ZXJDYXNlICovXG5sZXQgbGNDYWNoZSA9IHt9O1xuZXhwb3J0IGNvbnN0IHRvTG93ZXJDYXNlID0gcyA9PiBsY0NhY2hlW3NdIHx8IChsY0NhY2hlW3NdID0gcy50b0xvd2VyQ2FzZSgpKTtcblxuXG4vKiogQ2FsbCBhIGZ1bmN0aW9uIGFzeW5jaHJvbm91c2x5LCBhcyBzb29uIGFzIHBvc3NpYmxlLlxuICpcdEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrXG4gKi9cbmxldCByZXNvbHZlZCA9IHR5cGVvZiBQcm9taXNlIT09J3VuZGVmaW5lZCcgJiYgUHJvbWlzZS5yZXNvbHZlKCk7XG5leHBvcnQgY29uc3QgZGVmZXIgPSByZXNvbHZlZCA/IChmID0+IHsgcmVzb2x2ZWQudGhlbihmKTsgfSkgOiBzZXRUaW1lb3V0O1xuIiwiLy8gcmVuZGVyIG1vZGVzXG5cbmV4cG9ydCBjb25zdCBOT19SRU5ERVIgPSAwO1xuZXhwb3J0IGNvbnN0IFNZTkNfUkVOREVSID0gMTtcbmV4cG9ydCBjb25zdCBGT1JDRV9SRU5ERVIgPSAyO1xuZXhwb3J0IGNvbnN0IEFTWU5DX1JFTkRFUiA9IDM7XG5cbmV4cG9ydCBjb25zdCBFTVBUWSA9IHt9O1xuXG5leHBvcnQgY29uc3QgQVRUUl9LRVkgPSB0eXBlb2YgU3ltYm9sIT09J3VuZGVmaW5lZCcgPyBTeW1ib2wuZm9yKCdwcmVhY3RhdHRyJykgOiAnX19wcmVhY3RhdHRyXyc7XG5cbi8vIERPTSBwcm9wZXJ0aWVzIHRoYXQgc2hvdWxkIE5PVCBoYXZlIFwicHhcIiBhZGRlZCB3aGVuIG51bWVyaWNcbmV4cG9ydCBjb25zdCBOT05fRElNRU5TSU9OX1BST1BTID0ge1xuXHRib3hGbGV4OjEsIGJveEZsZXhHcm91cDoxLCBjb2x1bW5Db3VudDoxLCBmaWxsT3BhY2l0eToxLCBmbGV4OjEsIGZsZXhHcm93OjEsXG5cdGZsZXhQb3NpdGl2ZToxLCBmbGV4U2hyaW5rOjEsIGZsZXhOZWdhdGl2ZToxLCBmb250V2VpZ2h0OjEsIGxpbmVDbGFtcDoxLCBsaW5lSGVpZ2h0OjEsXG5cdG9wYWNpdHk6MSwgb3JkZXI6MSwgb3JwaGFuczoxLCBzdHJva2VPcGFjaXR5OjEsIHdpZG93czoxLCB6SW5kZXg6MSwgem9vbToxXG59O1xuXG4vLyBET00gZXZlbnQgdHlwZXMgdGhhdCBkbyBub3QgYnViYmxlIGFuZCBzaG91bGQgYmUgYXR0YWNoZWQgdmlhIHVzZUNhcHR1cmVcbmV4cG9ydCBjb25zdCBOT05fQlVCQkxJTkdfRVZFTlRTID0geyBibHVyOjEsIGVycm9yOjEsIGZvY3VzOjEsIGxvYWQ6MSwgcmVzaXplOjEsIHNjcm9sbDoxIH07XG4iLCJpbXBvcnQgeyBpc1N0cmluZywgZGVsdmUgfSBmcm9tICcuL3V0aWwnO1xuXG4vKiogQ3JlYXRlIGFuIEV2ZW50IGhhbmRsZXIgZnVuY3Rpb24gdGhhdCBzZXRzIGEgZ2l2ZW4gc3RhdGUgcHJvcGVydHkuXG4gKlx0QHBhcmFtIHtDb21wb25lbnR9IGNvbXBvbmVudFx0VGhlIGNvbXBvbmVudCB3aG9zZSBzdGF0ZSBzaG91bGQgYmUgdXBkYXRlZFxuICpcdEBwYXJhbSB7c3RyaW5nfSBrZXlcdFx0XHRcdEEgZG90LW5vdGF0ZWQga2V5IHBhdGggdG8gdXBkYXRlIGluIHRoZSBjb21wb25lbnQncyBzdGF0ZVxuICpcdEBwYXJhbSB7c3RyaW5nfSBldmVudFBhdGhcdFx0QSBkb3Qtbm90YXRlZCBrZXkgcGF0aCB0byB0aGUgdmFsdWUgdGhhdCBzaG91bGQgYmUgcmV0cmlldmVkIGZyb20gdGhlIEV2ZW50IG9yIGNvbXBvbmVudFxuICpcdEByZXR1cm5zIHtmdW5jdGlvbn0gbGlua2VkU3RhdGVIYW5kbGVyXG4gKlx0QHByaXZhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxpbmtlZFN0YXRlKGNvbXBvbmVudCwga2V5LCBldmVudFBhdGgpIHtcblx0bGV0IHBhdGggPSBrZXkuc3BsaXQoJy4nKTtcblx0cmV0dXJuIGZ1bmN0aW9uKGUpIHtcblx0XHRsZXQgdCA9IGUgJiYgZS50YXJnZXQgfHwgdGhpcyxcblx0XHRcdHN0YXRlID0ge30sXG5cdFx0XHRvYmogPSBzdGF0ZSxcblx0XHRcdHYgPSBpc1N0cmluZyhldmVudFBhdGgpID8gZGVsdmUoZSwgZXZlbnRQYXRoKSA6IHQubm9kZU5hbWUgPyAodC50eXBlLm1hdGNoKC9eY2hlfHJhZC8pID8gdC5jaGVja2VkIDogdC52YWx1ZSkgOiBlLFxuXHRcdFx0aSA9IDA7XG5cdFx0Zm9yICggOyBpPHBhdGgubGVuZ3RoLTE7IGkrKykge1xuXHRcdFx0b2JqID0gb2JqW3BhdGhbaV1dIHx8IChvYmpbcGF0aFtpXV0gPSAhaSAmJiBjb21wb25lbnQuc3RhdGVbcGF0aFtpXV0gfHwge30pO1xuXHRcdH1cblx0XHRvYmpbcGF0aFtpXV0gPSB2O1xuXHRcdGNvbXBvbmVudC5zZXRTdGF0ZShzdGF0ZSk7XG5cdH07XG59XG4iLCJpbXBvcnQgb3B0aW9ucyBmcm9tICcuL29wdGlvbnMnO1xuaW1wb3J0IHsgZGVmZXIgfSBmcm9tICcuL3V0aWwnO1xuaW1wb3J0IHsgcmVuZGVyQ29tcG9uZW50IH0gZnJvbSAnLi92ZG9tL2NvbXBvbmVudCc7XG5cbi8qKiBNYW5hZ2VkIHF1ZXVlIG9mIGRpcnR5IGNvbXBvbmVudHMgdG8gYmUgcmUtcmVuZGVyZWQgKi9cblxuLy8gaXRlbXMvaXRlbXNPZmZsaW5lIHN3YXAgb24gZWFjaCByZXJlbmRlcigpIGNhbGwgKGp1c3QgYSBzaW1wbGUgcG9vbCB0ZWNobmlxdWUpXG5sZXQgaXRlbXMgPSBbXTtcblxuZXhwb3J0IGZ1bmN0aW9uIGVucXVldWVSZW5kZXIoY29tcG9uZW50KSB7XG5cdGlmICghY29tcG9uZW50Ll9kaXJ0eSAmJiAoY29tcG9uZW50Ll9kaXJ0eSA9IHRydWUpICYmIGl0ZW1zLnB1c2goY29tcG9uZW50KT09MSkge1xuXHRcdChvcHRpb25zLmRlYm91bmNlUmVuZGVyaW5nIHx8IGRlZmVyKShyZXJlbmRlcik7XG5cdH1cbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gcmVyZW5kZXIoKSB7XG5cdGxldCBwLCBsaXN0ID0gaXRlbXM7XG5cdGl0ZW1zID0gW107XG5cdHdoaWxlICggKHAgPSBsaXN0LnBvcCgpKSApIHtcblx0XHRpZiAocC5fZGlydHkpIHJlbmRlckNvbXBvbmVudChwKTtcblx0fVxufVxuIiwiaW1wb3J0IHsgRU1QVFkgfSBmcm9tICcuLi9jb25zdGFudHMnO1xuaW1wb3J0IHsgZ2V0Tm9kZVByb3BzIH0gZnJvbSAnLi9pbmRleCc7XG5pbXBvcnQgeyBpc0Z1bmN0aW9uIH0gZnJvbSAnLi4vdXRpbCc7XG5cblxuLyoqIENoZWNrIGlmIGEgVk5vZGUgaXMgYSByZWZlcmVuY2UgdG8gYSBzdGF0ZWxlc3MgZnVuY3Rpb25hbCBjb21wb25lbnQuXG4gKlx0QSBmdW5jdGlvbiBjb21wb25lbnQgaXMgcmVwcmVzZW50ZWQgYXMgYSBWTm9kZSB3aG9zZSBgbm9kZU5hbWVgIHByb3BlcnR5IGlzIGEgcmVmZXJlbmNlIHRvIGEgZnVuY3Rpb24uXG4gKlx0SWYgdGhhdCBmdW5jdGlvbiBpcyBub3QgYSBDb21wb25lbnQgKGllLCBoYXMgbm8gYC5yZW5kZXIoKWAgbWV0aG9kIG9uIGEgcHJvdG90eXBlKSwgaXQgaXMgY29uc2lkZXJlZCBhIHN0YXRlbGVzcyBmdW5jdGlvbmFsIGNvbXBvbmVudC5cbiAqXHRAcGFyYW0ge1ZOb2RlfSB2bm9kZVx0QSBWTm9kZVxuICpcdEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0Z1bmN0aW9uYWxDb21wb25lbnQodm5vZGUpIHtcblx0bGV0IG5vZGVOYW1lID0gdm5vZGUgJiYgdm5vZGUubm9kZU5hbWU7XG5cdHJldHVybiBub2RlTmFtZSAmJiBpc0Z1bmN0aW9uKG5vZGVOYW1lKSAmJiAhKG5vZGVOYW1lLnByb3RvdHlwZSAmJiBub2RlTmFtZS5wcm90b3R5cGUucmVuZGVyKTtcbn1cblxuXG5cbi8qKiBDb25zdHJ1Y3QgYSByZXN1bHRhbnQgVk5vZGUgZnJvbSBhIFZOb2RlIHJlZmVyZW5jaW5nIGEgc3RhdGVsZXNzIGZ1bmN0aW9uYWwgY29tcG9uZW50LlxuICpcdEBwYXJhbSB7Vk5vZGV9IHZub2RlXHRBIFZOb2RlIHdpdGggYSBgbm9kZU5hbWVgIHByb3BlcnR5IHRoYXQgaXMgYSByZWZlcmVuY2UgdG8gYSBmdW5jdGlvbi5cbiAqXHRAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRGdW5jdGlvbmFsQ29tcG9uZW50KHZub2RlLCBjb250ZXh0KSB7XG5cdHJldHVybiB2bm9kZS5ub2RlTmFtZShnZXROb2RlUHJvcHModm5vZGUpLCBjb250ZXh0IHx8IEVNUFRZKTtcbn1cbiIsImltcG9ydCB7IGNsb25lLCBpc1N0cmluZywgaXNGdW5jdGlvbiwgdG9Mb3dlckNhc2UgfSBmcm9tICcuLi91dGlsJztcbmltcG9ydCB7IGlzRnVuY3Rpb25hbENvbXBvbmVudCB9IGZyb20gJy4vZnVuY3Rpb25hbC1jb21wb25lbnQnO1xuXG5cbi8qKiBDaGVjayBpZiB0d28gbm9kZXMgYXJlIGVxdWl2YWxlbnQuXG4gKlx0QHBhcmFtIHtFbGVtZW50fSBub2RlXG4gKlx0QHBhcmFtIHtWTm9kZX0gdm5vZGVcbiAqXHRAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNTYW1lTm9kZVR5cGUobm9kZSwgdm5vZGUpIHtcblx0aWYgKGlzU3RyaW5nKHZub2RlKSkge1xuXHRcdHJldHVybiBub2RlIGluc3RhbmNlb2YgVGV4dDtcblx0fVxuXHRpZiAoaXNTdHJpbmcodm5vZGUubm9kZU5hbWUpKSB7XG5cdFx0cmV0dXJuICFub2RlLl9jb21wb25lbnRDb25zdHJ1Y3RvciAmJiBpc05hbWVkTm9kZShub2RlLCB2bm9kZS5ub2RlTmFtZSk7XG5cdH1cblx0aWYgKGlzRnVuY3Rpb24odm5vZGUubm9kZU5hbWUpKSB7XG5cdFx0cmV0dXJuIChub2RlLl9jb21wb25lbnRDb25zdHJ1Y3RvciA/IG5vZGUuX2NvbXBvbmVudENvbnN0cnVjdG9yPT09dm5vZGUubm9kZU5hbWUgOiB0cnVlKSB8fCBpc0Z1bmN0aW9uYWxDb21wb25lbnQodm5vZGUpO1xuXHR9XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTmFtZWROb2RlKG5vZGUsIG5vZGVOYW1lKSB7XG5cdHJldHVybiBub2RlLm5vcm1hbGl6ZWROb2RlTmFtZT09PW5vZGVOYW1lIHx8IHRvTG93ZXJDYXNlKG5vZGUubm9kZU5hbWUpPT09dG9Mb3dlckNhc2Uobm9kZU5hbWUpO1xufVxuXG5cbi8qKlxuICogUmVjb25zdHJ1Y3QgQ29tcG9uZW50LXN0eWxlIGBwcm9wc2AgZnJvbSBhIFZOb2RlLlxuICogRW5zdXJlcyBkZWZhdWx0L2ZhbGxiYWNrIHZhbHVlcyBmcm9tIGBkZWZhdWx0UHJvcHNgOlxuICogT3duLXByb3BlcnRpZXMgb2YgYGRlZmF1bHRQcm9wc2Agbm90IHByZXNlbnQgaW4gYHZub2RlLmF0dHJpYnV0ZXNgIGFyZSBhZGRlZC5cbiAqIEBwYXJhbSB7Vk5vZGV9IHZub2RlXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBwcm9wc1xuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Tm9kZVByb3BzKHZub2RlKSB7XG5cdGxldCBwcm9wcyA9IGNsb25lKHZub2RlLmF0dHJpYnV0ZXMpO1xuXHRwcm9wcy5jaGlsZHJlbiA9IHZub2RlLmNoaWxkcmVuO1xuXG5cdGxldCBkZWZhdWx0UHJvcHMgPSB2bm9kZS5ub2RlTmFtZS5kZWZhdWx0UHJvcHM7XG5cdGlmIChkZWZhdWx0UHJvcHMpIHtcblx0XHRmb3IgKGxldCBpIGluIGRlZmF1bHRQcm9wcykge1xuXHRcdFx0aWYgKHByb3BzW2ldPT09dW5kZWZpbmVkKSB7XG5cdFx0XHRcdHByb3BzW2ldID0gZGVmYXVsdFByb3BzW2ldO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBwcm9wcztcbn1cbiIsImltcG9ydCB7IE5PTl9ESU1FTlNJT05fUFJPUFMsIE5PTl9CVUJCTElOR19FVkVOVFMgfSBmcm9tICcuLi9jb25zdGFudHMnO1xuaW1wb3J0IG9wdGlvbnMgZnJvbSAnLi4vb3B0aW9ucyc7XG5pbXBvcnQgeyB0b0xvd2VyQ2FzZSwgaXNTdHJpbmcsIGlzRnVuY3Rpb24sIGhhc2hUb0NsYXNzTmFtZSB9IGZyb20gJy4uL3V0aWwnO1xuXG5cblxuXG4vKiogUmVtb3ZlcyBhIGdpdmVuIERPTSBOb2RlIGZyb20gaXRzIHBhcmVudC4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVOb2RlKG5vZGUpIHtcblx0bGV0IHAgPSBub2RlLnBhcmVudE5vZGU7XG5cdGlmIChwKSBwLnJlbW92ZUNoaWxkKG5vZGUpO1xufVxuXG5cbi8qKiBTZXQgYSBuYW1lZCBhdHRyaWJ1dGUgb24gdGhlIGdpdmVuIE5vZGUsIHdpdGggc3BlY2lhbCBiZWhhdmlvciBmb3Igc29tZSBuYW1lcyBhbmQgZXZlbnQgaGFuZGxlcnMuXG4gKlx0SWYgYHZhbHVlYCBpcyBgbnVsbGAsIHRoZSBhdHRyaWJ1dGUvaGFuZGxlciB3aWxsIGJlIHJlbW92ZWQuXG4gKlx0QHBhcmFtIHtFbGVtZW50fSBub2RlXHRBbiBlbGVtZW50IHRvIG11dGF0ZVxuICpcdEBwYXJhbSB7c3RyaW5nfSBuYW1lXHRUaGUgbmFtZS9rZXkgdG8gc2V0LCBzdWNoIGFzIGFuIGV2ZW50IG9yIGF0dHJpYnV0ZSBuYW1lXG4gKlx0QHBhcmFtIHthbnl9IHZhbHVlXHRcdEFuIGF0dHJpYnV0ZSB2YWx1ZSwgc3VjaCBhcyBhIGZ1bmN0aW9uIHRvIGJlIHVzZWQgYXMgYW4gZXZlbnQgaGFuZGxlclxuICpcdEBwYXJhbSB7YW55fSBwcmV2aW91c1ZhbHVlXHRUaGUgbGFzdCB2YWx1ZSB0aGF0IHdhcyBzZXQgZm9yIHRoaXMgbmFtZS9ub2RlIHBhaXJcbiAqXHRAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0QWNjZXNzb3Iobm9kZSwgbmFtZSwgb2xkLCB2YWx1ZSwgaXNTdmcpIHtcblxuXHRpZiAobmFtZT09PSdjbGFzc05hbWUnKSBuYW1lID0gJ2NsYXNzJztcblxuXHRpZiAobmFtZT09PSdjbGFzcycgJiYgdmFsdWUgJiYgdHlwZW9mIHZhbHVlPT09J29iamVjdCcpIHtcblx0XHR2YWx1ZSA9IGhhc2hUb0NsYXNzTmFtZSh2YWx1ZSk7XG5cdH1cblxuXHRpZiAobmFtZT09PSdrZXknKSB7XG5cdFx0Ly8gaWdub3JlXG5cdH1cblx0ZWxzZSBpZiAobmFtZT09PSdjbGFzcycgJiYgIWlzU3ZnKSB7XG5cdFx0bm9kZS5jbGFzc05hbWUgPSB2YWx1ZSB8fCAnJztcblx0fVxuXHRlbHNlIGlmIChuYW1lPT09J3N0eWxlJykge1xuXHRcdGlmICghdmFsdWUgfHwgaXNTdHJpbmcodmFsdWUpIHx8IGlzU3RyaW5nKG9sZCkpIHtcblx0XHRcdG5vZGUuc3R5bGUuY3NzVGV4dCA9IHZhbHVlIHx8ICcnO1xuXHRcdH1cblx0XHRpZiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlPT09J29iamVjdCcpIHtcblx0XHRcdGlmICghaXNTdHJpbmcob2xkKSkge1xuXHRcdFx0XHRmb3IgKGxldCBpIGluIG9sZCkgaWYgKCEoaSBpbiB2YWx1ZSkpIG5vZGUuc3R5bGVbaV0gPSAnJztcblx0XHRcdH1cblx0XHRcdGZvciAobGV0IGkgaW4gdmFsdWUpIHtcblx0XHRcdFx0bm9kZS5zdHlsZVtpXSA9IHR5cGVvZiB2YWx1ZVtpXT09PSdudW1iZXInICYmICFOT05fRElNRU5TSU9OX1BST1BTW2ldID8gKHZhbHVlW2ldKydweCcpIDogdmFsdWVbaV07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGVsc2UgaWYgKG5hbWU9PT0nZGFuZ2Vyb3VzbHlTZXRJbm5lckhUTUwnKSB7XG5cdFx0bm9kZS5pbm5lckhUTUwgPSB2YWx1ZSAmJiB2YWx1ZS5fX2h0bWwgfHwgJyc7XG5cdH1cblx0ZWxzZSBpZiAobmFtZVswXT09J28nICYmIG5hbWVbMV09PSduJykge1xuXHRcdGxldCBsID0gbm9kZS5fbGlzdGVuZXJzIHx8IChub2RlLl9saXN0ZW5lcnMgPSB7fSk7XG5cdFx0bmFtZSA9IHRvTG93ZXJDYXNlKG5hbWUuc3Vic3RyaW5nKDIpKTtcblx0XHQvLyBAVE9ETzogdGhpcyBtaWdodCBiZSB3b3J0aCBpdCBsYXRlciwgdW4tYnJlYWtzIGZvY3VzL2JsdXIgYnViYmxpbmcgaW4gSUU5OlxuXHRcdC8vIGlmIChub2RlLmF0dGFjaEV2ZW50KSBuYW1lID0gbmFtZT09J2ZvY3VzJz8nZm9jdXNpbic6bmFtZT09J2JsdXInPydmb2N1c291dCc6bmFtZTtcblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdGlmICghbFtuYW1lXSkgbm9kZS5hZGRFdmVudExpc3RlbmVyKG5hbWUsIGV2ZW50UHJveHksICEhTk9OX0JVQkJMSU5HX0VWRU5UU1tuYW1lXSk7XG5cdFx0fVxuXHRcdGVsc2UgaWYgKGxbbmFtZV0pIHtcblx0XHRcdG5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcihuYW1lLCBldmVudFByb3h5LCAhIU5PTl9CVUJCTElOR19FVkVOVFNbbmFtZV0pO1xuXHRcdH1cblx0XHRsW25hbWVdID0gdmFsdWU7XG5cdH1cblx0ZWxzZSBpZiAobmFtZSE9PSdsaXN0JyAmJiBuYW1lIT09J3R5cGUnICYmICFpc1N2ZyAmJiBuYW1lIGluIG5vZGUpIHtcblx0XHRzZXRQcm9wZXJ0eShub2RlLCBuYW1lLCB2YWx1ZT09bnVsbCA/ICcnIDogdmFsdWUpO1xuXHRcdGlmICh2YWx1ZT09bnVsbCB8fCB2YWx1ZT09PWZhbHNlKSBub2RlLnJlbW92ZUF0dHJpYnV0ZShuYW1lKTtcblx0fVxuXHRlbHNlIHtcblx0XHRsZXQgbnMgPSBpc1N2ZyAmJiBuYW1lLm1hdGNoKC9eeGxpbmtcXDo/KC4rKS8pO1xuXHRcdGlmICh2YWx1ZT09bnVsbCB8fCB2YWx1ZT09PWZhbHNlKSB7XG5cdFx0XHRpZiAobnMpIG5vZGUucmVtb3ZlQXR0cmlidXRlTlMoJ2h0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsnLCB0b0xvd2VyQ2FzZShuc1sxXSkpO1xuXHRcdFx0ZWxzZSBub2RlLnJlbW92ZUF0dHJpYnV0ZShuYW1lKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAodHlwZW9mIHZhbHVlIT09J29iamVjdCcgJiYgIWlzRnVuY3Rpb24odmFsdWUpKSB7XG5cdFx0XHRpZiAobnMpIG5vZGUuc2V0QXR0cmlidXRlTlMoJ2h0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsnLCB0b0xvd2VyQ2FzZShuc1sxXSksIHZhbHVlKTtcblx0XHRcdGVsc2Ugbm9kZS5zZXRBdHRyaWJ1dGUobmFtZSwgdmFsdWUpO1xuXHRcdH1cblx0fVxufVxuXG5cbi8qKiBBdHRlbXB0IHRvIHNldCBhIERPTSBwcm9wZXJ0eSB0byB0aGUgZ2l2ZW4gdmFsdWUuXG4gKlx0SUUgJiBGRiB0aHJvdyBmb3IgY2VydGFpbiBwcm9wZXJ0eS12YWx1ZSBjb21iaW5hdGlvbnMuXG4gKi9cbmZ1bmN0aW9uIHNldFByb3BlcnR5KG5vZGUsIG5hbWUsIHZhbHVlKSB7XG5cdHRyeSB7XG5cdFx0bm9kZVtuYW1lXSA9IHZhbHVlO1xuXHR9IGNhdGNoIChlKSB7IH1cbn1cblxuXG4vKiogUHJveHkgYW4gZXZlbnQgdG8gaG9va2VkIGV2ZW50IGhhbmRsZXJzXG4gKlx0QHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gZXZlbnRQcm94eShlKSB7XG5cdHJldHVybiB0aGlzLl9saXN0ZW5lcnNbZS50eXBlXShvcHRpb25zLmV2ZW50ICYmIG9wdGlvbnMuZXZlbnQoZSkgfHwgZSk7XG59XG4iLCJpbXBvcnQgeyB0b0xvd2VyQ2FzZSB9IGZyb20gJy4uL3V0aWwnO1xuaW1wb3J0IHsgcmVtb3ZlTm9kZSB9IGZyb20gJy4vaW5kZXgnO1xuXG4vKiogRE9NIG5vZGUgcG9vbCwga2V5ZWQgb24gbm9kZU5hbWUuICovXG5cbmNvbnN0IG5vZGVzID0ge307XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2xsZWN0Tm9kZShub2RlKSB7XG5cdHJlbW92ZU5vZGUobm9kZSk7XG5cblx0aWYgKG5vZGUgaW5zdGFuY2VvZiBFbGVtZW50KSB7XG5cdFx0bm9kZS5fY29tcG9uZW50ID0gbm9kZS5fY29tcG9uZW50Q29uc3RydWN0b3IgPSBudWxsO1xuXG5cdFx0bGV0IG5hbWUgPSBub2RlLm5vcm1hbGl6ZWROb2RlTmFtZSB8fCB0b0xvd2VyQ2FzZShub2RlLm5vZGVOYW1lKTtcblx0XHQobm9kZXNbbmFtZV0gfHwgKG5vZGVzW25hbWVdID0gW10pKS5wdXNoKG5vZGUpO1xuXHR9XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU5vZGUobm9kZU5hbWUsIGlzU3ZnKSB7XG5cdGxldCBuYW1lID0gdG9Mb3dlckNhc2Uobm9kZU5hbWUpLFxuXHRcdG5vZGUgPSBub2Rlc1tuYW1lXSAmJiBub2Rlc1tuYW1lXS5wb3AoKSB8fCAoaXNTdmcgPyBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgbm9kZU5hbWUpIDogZG9jdW1lbnQuY3JlYXRlRWxlbWVudChub2RlTmFtZSkpO1xuXHRub2RlLm5vcm1hbGl6ZWROb2RlTmFtZSA9IG5hbWU7XG5cdHJldHVybiBub2RlO1xufVxuIiwiaW1wb3J0IHsgQVRUUl9LRVkgfSBmcm9tICcuLi9jb25zdGFudHMnO1xuaW1wb3J0IHsgaXNTdHJpbmcsIGlzRnVuY3Rpb24gfSBmcm9tICcuLi91dGlsJztcbmltcG9ydCB7IGlzU2FtZU5vZGVUeXBlLCBpc05hbWVkTm9kZSB9IGZyb20gJy4vaW5kZXgnO1xuaW1wb3J0IHsgaXNGdW5jdGlvbmFsQ29tcG9uZW50LCBidWlsZEZ1bmN0aW9uYWxDb21wb25lbnQgfSBmcm9tICcuL2Z1bmN0aW9uYWwtY29tcG9uZW50JztcbmltcG9ydCB7IGJ1aWxkQ29tcG9uZW50RnJvbVZOb2RlIH0gZnJvbSAnLi9jb21wb25lbnQnO1xuaW1wb3J0IHsgc2V0QWNjZXNzb3IsIHJlbW92ZU5vZGUgfSBmcm9tICcuLi9kb20vaW5kZXgnO1xuaW1wb3J0IHsgY3JlYXRlTm9kZSwgY29sbGVjdE5vZGUgfSBmcm9tICcuLi9kb20vcmVjeWNsZXInO1xuaW1wb3J0IHsgdW5tb3VudENvbXBvbmVudCB9IGZyb20gJy4vY29tcG9uZW50JztcbmltcG9ydCBvcHRpb25zIGZyb20gJy4uL29wdGlvbnMnO1xuXG5cbi8qKiBRdWV1ZSBvZiBjb21wb25lbnRzIHRoYXQgaGF2ZSBiZWVuIG1vdW50ZWQgYW5kIGFyZSBhd2FpdGluZyBjb21wb25lbnREaWRNb3VudCAqL1xuZXhwb3J0IGNvbnN0IG1vdW50cyA9IFtdO1xuXG4vKiogRGlmZiByZWN1cnNpb24gY291bnQsIHVzZWQgdG8gdHJhY2sgdGhlIGVuZCBvZiB0aGUgZGlmZiBjeWNsZS4gKi9cbmV4cG9ydCBsZXQgZGlmZkxldmVsID0gMDtcblxuLyoqIEdsb2JhbCBmbGFnIGluZGljYXRpbmcgaWYgdGhlIGRpZmYgaXMgY3VycmVudGx5IHdpdGhpbiBhbiBTVkcgKi9cbmxldCBpc1N2Z01vZGUgPSBmYWxzZTtcblxuLyoqIEdsb2JhbCBmbGFnIGluZGljYXRpbmcgaWYgdGhlIGRpZmYgaXMgcGVyZm9ybWluZyBoeWRyYXRpb24gKi9cbmxldCBoeWRyYXRpbmcgPSBmYWxzZTtcblxuXG4vKiogSW52b2tlIHF1ZXVlZCBjb21wb25lbnREaWRNb3VudCBsaWZlY3ljbGUgbWV0aG9kcyAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZsdXNoTW91bnRzKCkge1xuXHRsZXQgYztcblx0d2hpbGUgKChjPW1vdW50cy5wb3AoKSkpIHtcblx0XHRpZiAob3B0aW9ucy5hZnRlck1vdW50KSBvcHRpb25zLmFmdGVyTW91bnQoYyk7XG5cdFx0aWYgKGMuY29tcG9uZW50RGlkTW91bnQpIGMuY29tcG9uZW50RGlkTW91bnQoKTtcblx0fVxufVxuXG5cbi8qKiBBcHBseSBkaWZmZXJlbmNlcyBpbiBhIGdpdmVuIHZub2RlIChhbmQgaXQncyBkZWVwIGNoaWxkcmVuKSB0byBhIHJlYWwgRE9NIE5vZGUuXG4gKlx0QHBhcmFtIHtFbGVtZW50fSBbZG9tPW51bGxdXHRcdEEgRE9NIG5vZGUgdG8gbXV0YXRlIGludG8gdGhlIHNoYXBlIG9mIHRoZSBgdm5vZGVgXG4gKlx0QHBhcmFtIHtWTm9kZX0gdm5vZGVcdFx0XHRBIFZOb2RlICh3aXRoIGRlc2NlbmRhbnRzIGZvcm1pbmcgYSB0cmVlKSByZXByZXNlbnRpbmcgdGhlIGRlc2lyZWQgRE9NIHN0cnVjdHVyZVxuICpcdEByZXR1cm5zIHtFbGVtZW50fSBkb21cdFx0XHRUaGUgY3JlYXRlZC9tdXRhdGVkIGVsZW1lbnRcbiAqXHRAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gZGlmZihkb20sIHZub2RlLCBjb250ZXh0LCBtb3VudEFsbCwgcGFyZW50LCBjb21wb25lbnRSb290KSB7XG5cdC8vIGRpZmZMZXZlbCBoYXZpbmcgYmVlbiAwIGhlcmUgaW5kaWNhdGVzIGluaXRpYWwgZW50cnkgaW50byB0aGUgZGlmZiAobm90IGEgc3ViZGlmZilcblx0aWYgKCFkaWZmTGV2ZWwrKykge1xuXHRcdC8vIHdoZW4gZmlyc3Qgc3RhcnRpbmcgdGhlIGRpZmYsIGNoZWNrIGlmIHdlJ3JlIGRpZmZpbmcgYW4gU1ZHIG9yIHdpdGhpbiBhbiBTVkdcblx0XHRpc1N2Z01vZGUgPSBwYXJlbnQgaW5zdGFuY2VvZiBTVkdFbGVtZW50O1xuXG5cdFx0Ly8gaHlkcmF0aW9uIGlzIGluaWRpY2F0ZWQgYnkgdGhlIGV4aXN0aW5nIGVsZW1lbnQgdG8gYmUgZGlmZmVkIG5vdCBoYXZpbmcgYSBwcm9wIGNhY2hlXG5cdFx0aHlkcmF0aW5nID0gZG9tICYmICEoQVRUUl9LRVkgaW4gZG9tKTtcblx0fVxuXG5cdGxldCByZXQgPSBpZGlmZihkb20sIHZub2RlLCBjb250ZXh0LCBtb3VudEFsbCk7XG5cblx0Ly8gYXBwZW5kIHRoZSBlbGVtZW50IGlmIGl0cyBhIG5ldyBwYXJlbnRcblx0aWYgKHBhcmVudCAmJiByZXQucGFyZW50Tm9kZSE9PXBhcmVudCkgcGFyZW50LmFwcGVuZENoaWxkKHJldCk7XG5cblx0Ly8gZGlmZkxldmVsIGJlaW5nIHJlZHVjZWQgdG8gMCBtZWFucyB3ZSdyZSBleGl0aW5nIHRoZSBkaWZmXG5cdGlmICghLS1kaWZmTGV2ZWwpIHtcblx0XHRoeWRyYXRpbmcgPSBmYWxzZTtcblx0XHQvLyBpbnZva2UgcXVldWVkIGNvbXBvbmVudERpZE1vdW50IGxpZmVjeWNsZSBtZXRob2RzXG5cdFx0aWYgKCFjb21wb25lbnRSb290KSBmbHVzaE1vdW50cygpO1xuXHR9XG5cblx0cmV0dXJuIHJldDtcbn1cblxuXG5mdW5jdGlvbiBpZGlmZihkb20sIHZub2RlLCBjb250ZXh0LCBtb3VudEFsbCkge1xuXHRsZXQgb3JpZ2luYWxBdHRyaWJ1dGVzID0gdm5vZGUgJiYgdm5vZGUuYXR0cmlidXRlcztcblxuXG5cdC8vIFJlc29sdmUgZXBoZW1lcmFsIFB1cmUgRnVuY3Rpb25hbCBDb21wb25lbnRzXG5cdHdoaWxlIChpc0Z1bmN0aW9uYWxDb21wb25lbnQodm5vZGUpKSB7XG5cdFx0dm5vZGUgPSBidWlsZEZ1bmN0aW9uYWxDb21wb25lbnQodm5vZGUsIGNvbnRleHQpO1xuXHR9XG5cblxuXHQvLyBlbXB0eSB2YWx1ZXMgKG51bGwgJiB1bmRlZmluZWQpIHJlbmRlciBhcyBlbXB0eSBUZXh0IG5vZGVzXG5cdGlmICh2bm9kZT09bnVsbCkgdm5vZGUgPSAnJztcblxuXG5cdC8vIEZhc3QgY2FzZTogU3RyaW5ncyBjcmVhdGUvdXBkYXRlIFRleHQgbm9kZXMuXG5cdGlmIChpc1N0cmluZyh2bm9kZSkpIHtcblx0XHQvLyB1cGRhdGUgaWYgaXQncyBhbHJlYWR5IGEgVGV4dCBub2RlXG5cdFx0aWYgKGRvbSAmJiBkb20gaW5zdGFuY2VvZiBUZXh0KSB7XG5cdFx0XHRpZiAoZG9tLm5vZGVWYWx1ZSE9dm5vZGUpIHtcblx0XHRcdFx0ZG9tLm5vZGVWYWx1ZSA9IHZub2RlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdC8vIGl0IHdhc24ndCBhIFRleHQgbm9kZTogcmVwbGFjZSBpdCB3aXRoIG9uZSBhbmQgcmVjeWNsZSB0aGUgb2xkIEVsZW1lbnRcblx0XHRcdGlmIChkb20pIHJlY29sbGVjdE5vZGVUcmVlKGRvbSk7XG5cdFx0XHRkb20gPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh2bm9kZSk7XG5cdFx0fVxuXG5cdFx0Ly8gTWFyayBmb3Igbm9uLWh5ZHJhdGlvbiB1cGRhdGVzXG5cdFx0ZG9tW0FUVFJfS0VZXSA9IHRydWU7XG5cdFx0cmV0dXJuIGRvbTtcblx0fVxuXG5cblx0Ly8gSWYgdGhlIFZOb2RlIHJlcHJlc2VudHMgYSBDb21wb25lbnQsIHBlcmZvcm0gYSBjb21wb25lbnQgZGlmZi5cblx0aWYgKGlzRnVuY3Rpb24odm5vZGUubm9kZU5hbWUpKSB7XG5cdFx0cmV0dXJuIGJ1aWxkQ29tcG9uZW50RnJvbVZOb2RlKGRvbSwgdm5vZGUsIGNvbnRleHQsIG1vdW50QWxsKTtcblx0fVxuXG5cblx0bGV0IG91dCA9IGRvbSxcblx0XHRub2RlTmFtZSA9IFN0cmluZyh2bm9kZS5ub2RlTmFtZSksXHQvLyBAVE9ETyB0aGlzIG1hc2tzIHVuZGVmaW5lZCBjb21wb25lbnQgZXJyb3JzIGFzIGA8dW5kZWZpbmVkPmBcblx0XHRwcmV2U3ZnTW9kZSA9IGlzU3ZnTW9kZSxcblx0XHR2Y2hpbGRyZW4gPSB2bm9kZS5jaGlsZHJlbjtcblxuXG5cdC8vIFNWR3MgaGF2ZSBzcGVjaWFsIG5hbWVzcGFjZSBzdHVmZi5cblx0Ly8gVGhpcyB0cmFja3MgZW50ZXJpbmcgYW5kIGV4aXRpbmcgdGhhdCBuYW1lc3BhY2Ugd2hlbiBkZXNjZW5kaW5nIHRocm91Z2ggdGhlIHRyZWUuXG5cdGlzU3ZnTW9kZSA9IG5vZGVOYW1lPT09J3N2ZycgPyB0cnVlIDogbm9kZU5hbWU9PT0nZm9yZWlnbk9iamVjdCcgPyBmYWxzZSA6IGlzU3ZnTW9kZTtcblxuXG5cdGlmICghZG9tKSB7XG5cdFx0Ly8gY2FzZTogd2UgaGFkIG5vIGVsZW1lbnQgdG8gYmVnaW4gd2l0aFxuXHRcdC8vIC0gY3JlYXRlIGFuIGVsZW1lbnQgdG8gd2l0aCB0aGUgbm9kZU5hbWUgZnJvbSBWTm9kZVxuXHRcdG91dCA9IGNyZWF0ZU5vZGUobm9kZU5hbWUsIGlzU3ZnTW9kZSk7XG5cdH1cblx0ZWxzZSBpZiAoIWlzTmFtZWROb2RlKGRvbSwgbm9kZU5hbWUpKSB7XG5cdFx0Ly8gY2FzZTogRWxlbWVudCBhbmQgVk5vZGUgaGFkIGRpZmZlcmVudCBub2RlTmFtZXNcblx0XHQvLyAtIG5lZWQgdG8gY3JlYXRlIHRoZSBjb3JyZWN0IEVsZW1lbnQgdG8gbWF0Y2ggVk5vZGVcblx0XHQvLyAtIHRoZW4gbWlncmF0ZSBjaGlsZHJlbiBmcm9tIG9sZCB0byBuZXdcblxuXHRcdG91dCA9IGNyZWF0ZU5vZGUobm9kZU5hbWUsIGlzU3ZnTW9kZSk7XG5cblx0XHQvLyBtb3ZlIGNoaWxkcmVuIGludG8gdGhlIHJlcGxhY2VtZW50IG5vZGVcblx0XHR3aGlsZSAoZG9tLmZpcnN0Q2hpbGQpIG91dC5hcHBlbmRDaGlsZChkb20uZmlyc3RDaGlsZCk7XG5cblx0XHQvLyBpZiB0aGUgcHJldmlvdXMgRWxlbWVudCB3YXMgbW91bnRlZCBpbnRvIHRoZSBET00sIHJlcGxhY2UgaXQgaW5saW5lXG5cdFx0aWYgKGRvbS5wYXJlbnROb2RlKSBkb20ucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQob3V0LCBkb20pO1xuXG5cdFx0Ly8gcmVjeWNsZSB0aGUgb2xkIGVsZW1lbnQgKHNraXBzIG5vbi1FbGVtZW50IG5vZGUgdHlwZXMpXG5cdFx0cmVjb2xsZWN0Tm9kZVRyZWUoZG9tKTtcblx0fVxuXG5cblx0bGV0IGZjID0gb3V0LmZpcnN0Q2hpbGQsXG5cdFx0cHJvcHMgPSBvdXRbQVRUUl9LRVldO1xuXG5cdC8vIEF0dHJpYnV0ZSBIeWRyYXRpb246IGlmIHRoZXJlIGlzIG5vIHByb3AgY2FjaGUgb24gdGhlIGVsZW1lbnQsXG5cdC8vIC4uLmNyZWF0ZSBpdCBhbmQgcG9wdWxhdGUgaXQgd2l0aCB0aGUgZWxlbWVudCdzIGF0dHJpYnV0ZXMuXG5cdGlmICghcHJvcHMpIHtcblx0XHRvdXRbQVRUUl9LRVldID0gcHJvcHMgPSB7fTtcblx0XHRmb3IgKGxldCBhPW91dC5hdHRyaWJ1dGVzLCBpPWEubGVuZ3RoOyBpLS07ICkgcHJvcHNbYVtpXS5uYW1lXSA9IGFbaV0udmFsdWU7XG5cdH1cblxuXHQvLyBBcHBseSBhdHRyaWJ1dGVzL3Byb3BzIGZyb20gVk5vZGUgdG8gdGhlIERPTSBFbGVtZW50OlxuXHRkaWZmQXR0cmlidXRlcyhvdXQsIHZub2RlLmF0dHJpYnV0ZXMsIHByb3BzKTtcblxuXG5cdC8vIE9wdGltaXphdGlvbjogZmFzdC1wYXRoIGZvciBlbGVtZW50cyBjb250YWluaW5nIGEgc2luZ2xlIFRleHROb2RlOlxuXHRpZiAoIWh5ZHJhdGluZyAmJiB2Y2hpbGRyZW4gJiYgdmNoaWxkcmVuLmxlbmd0aD09PTEgJiYgdHlwZW9mIHZjaGlsZHJlblswXT09PSdzdHJpbmcnICYmIGZjICYmIGZjIGluc3RhbmNlb2YgVGV4dCAmJiAhZmMubmV4dFNpYmxpbmcpIHtcblx0XHRpZiAoZmMubm9kZVZhbHVlIT12Y2hpbGRyZW5bMF0pIHtcblx0XHRcdGZjLm5vZGVWYWx1ZSA9IHZjaGlsZHJlblswXTtcblx0XHR9XG5cdH1cblx0Ly8gb3RoZXJ3aXNlLCBpZiB0aGVyZSBhcmUgZXhpc3Rpbmcgb3IgbmV3IGNoaWxkcmVuLCBkaWZmIHRoZW06XG5cdGVsc2UgaWYgKHZjaGlsZHJlbiAmJiB2Y2hpbGRyZW4ubGVuZ3RoIHx8IGZjKSB7XG5cdFx0aW5uZXJEaWZmTm9kZShvdXQsIHZjaGlsZHJlbiwgY29udGV4dCwgbW91bnRBbGwpO1xuXHR9XG5cblxuXHQvLyBpbnZva2Ugb3JpZ2luYWwgcmVmIChmcm9tIGJlZm9yZSByZXNvbHZpbmcgUHVyZSBGdW5jdGlvbmFsIENvbXBvbmVudHMpOlxuXHRpZiAob3JpZ2luYWxBdHRyaWJ1dGVzICYmIHR5cGVvZiBvcmlnaW5hbEF0dHJpYnV0ZXMucmVmPT09J2Z1bmN0aW9uJykge1xuXHRcdChwcm9wcy5yZWYgPSBvcmlnaW5hbEF0dHJpYnV0ZXMucmVmKShvdXQpO1xuXHR9XG5cblx0aXNTdmdNb2RlID0gcHJldlN2Z01vZGU7XG5cblx0cmV0dXJuIG91dDtcbn1cblxuXG4vKiogQXBwbHkgY2hpbGQgYW5kIGF0dHJpYnV0ZSBjaGFuZ2VzIGJldHdlZW4gYSBWTm9kZSBhbmQgYSBET00gTm9kZSB0byB0aGUgRE9NLlxuICpcdEBwYXJhbSB7RWxlbWVudH0gZG9tXHRcdEVsZW1lbnQgd2hvc2UgY2hpbGRyZW4gc2hvdWxkIGJlIGNvbXBhcmVkICYgbXV0YXRlZFxuICpcdEBwYXJhbSB7QXJyYXl9IHZjaGlsZHJlblx0QXJyYXkgb2YgVk5vZGVzIHRvIGNvbXBhcmUgdG8gYGRvbS5jaGlsZE5vZGVzYFxuICpcdEBwYXJhbSB7T2JqZWN0fSBjb250ZXh0XHRcdEltcGxpY2l0bHkgZGVzY2VuZGFudCBjb250ZXh0IG9iamVjdCAoZnJvbSBtb3N0IHJlY2VudCBgZ2V0Q2hpbGRDb250ZXh0KClgKVxuICpcdEBwYXJhbSB7Qm9vbGVhbn0gbW91dEFsbFxuICovXG5mdW5jdGlvbiBpbm5lckRpZmZOb2RlKGRvbSwgdmNoaWxkcmVuLCBjb250ZXh0LCBtb3VudEFsbCkge1xuXHRsZXQgb3JpZ2luYWxDaGlsZHJlbiA9IGRvbS5jaGlsZE5vZGVzLFxuXHRcdGNoaWxkcmVuID0gW10sXG5cdFx0a2V5ZWQgPSB7fSxcblx0XHRrZXllZExlbiA9IDAsXG5cdFx0bWluID0gMCxcblx0XHRsZW4gPSBvcmlnaW5hbENoaWxkcmVuLmxlbmd0aCxcblx0XHRjaGlsZHJlbkxlbiA9IDAsXG5cdFx0dmxlbiA9IHZjaGlsZHJlbiAmJiB2Y2hpbGRyZW4ubGVuZ3RoLFxuXHRcdGosIGMsIHZjaGlsZCwgY2hpbGQ7XG5cblx0aWYgKGxlbikge1xuXHRcdGZvciAobGV0IGk9MDsgaTxsZW47IGkrKykge1xuXHRcdFx0bGV0IGNoaWxkID0gb3JpZ2luYWxDaGlsZHJlbltpXSxcblx0XHRcdFx0cHJvcHMgPSBjaGlsZFtBVFRSX0tFWV0sXG5cdFx0XHRcdGtleSA9IHZsZW4gPyAoKGMgPSBjaGlsZC5fY29tcG9uZW50KSA/IGMuX19rZXkgOiBwcm9wcyA/IHByb3BzLmtleSA6IG51bGwpIDogbnVsbDtcblx0XHRcdGlmIChrZXkhPW51bGwpIHtcblx0XHRcdFx0a2V5ZWRMZW4rKztcblx0XHRcdFx0a2V5ZWRba2V5XSA9IGNoaWxkO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAoaHlkcmF0aW5nIHx8IHByb3BzKSB7XG5cdFx0XHRcdGNoaWxkcmVuW2NoaWxkcmVuTGVuKytdID0gY2hpbGQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aWYgKHZsZW4pIHtcblx0XHRmb3IgKGxldCBpPTA7IGk8dmxlbjsgaSsrKSB7XG5cdFx0XHR2Y2hpbGQgPSB2Y2hpbGRyZW5baV07XG5cdFx0XHRjaGlsZCA9IG51bGw7XG5cblx0XHRcdC8vIGlmIChpc0Z1bmN0aW9uYWxDb21wb25lbnQodmNoaWxkKSkge1xuXHRcdFx0Ly8gXHR2Y2hpbGQgPSBidWlsZEZ1bmN0aW9uYWxDb21wb25lbnQodmNoaWxkKTtcblx0XHRcdC8vIH1cblxuXHRcdFx0Ly8gYXR0ZW1wdCB0byBmaW5kIGEgbm9kZSBiYXNlZCBvbiBrZXkgbWF0Y2hpbmdcblx0XHRcdGxldCBrZXkgPSB2Y2hpbGQua2V5O1xuXHRcdFx0aWYgKGtleSE9bnVsbCkge1xuXHRcdFx0XHRpZiAoa2V5ZWRMZW4gJiYga2V5IGluIGtleWVkKSB7XG5cdFx0XHRcdFx0Y2hpbGQgPSBrZXllZFtrZXldO1xuXHRcdFx0XHRcdGtleWVkW2tleV0gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0a2V5ZWRMZW4tLTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gYXR0ZW1wdCB0byBwbHVjayBhIG5vZGUgb2YgdGhlIHNhbWUgdHlwZSBmcm9tIHRoZSBleGlzdGluZyBjaGlsZHJlblxuXHRcdFx0ZWxzZSBpZiAoIWNoaWxkICYmIG1pbjxjaGlsZHJlbkxlbikge1xuXHRcdFx0XHRmb3IgKGo9bWluOyBqPGNoaWxkcmVuTGVuOyBqKyspIHtcblx0XHRcdFx0XHRjID0gY2hpbGRyZW5bal07XG5cdFx0XHRcdFx0aWYgKGMgJiYgaXNTYW1lTm9kZVR5cGUoYywgdmNoaWxkKSkge1xuXHRcdFx0XHRcdFx0Y2hpbGQgPSBjO1xuXHRcdFx0XHRcdFx0Y2hpbGRyZW5bal0gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRpZiAoaj09PWNoaWxkcmVuTGVuLTEpIGNoaWxkcmVuTGVuLS07XG5cdFx0XHRcdFx0XHRpZiAoaj09PW1pbikgbWluKys7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gbW9ycGggdGhlIG1hdGNoZWQvZm91bmQvY3JlYXRlZCBET00gY2hpbGQgdG8gbWF0Y2ggdmNoaWxkIChkZWVwKVxuXHRcdFx0Y2hpbGQgPSBpZGlmZihjaGlsZCwgdmNoaWxkLCBjb250ZXh0LCBtb3VudEFsbCk7XG5cblx0XHRcdGlmIChjaGlsZCAmJiBjaGlsZCE9PWRvbSkge1xuXHRcdFx0XHRpZiAoaT49bGVuKSB7XG5cdFx0XHRcdFx0ZG9tLmFwcGVuZENoaWxkKGNoaWxkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIGlmIChjaGlsZCE9PW9yaWdpbmFsQ2hpbGRyZW5baV0pIHtcblx0XHRcdFx0XHRpZiAoY2hpbGQ9PT1vcmlnaW5hbENoaWxkcmVuW2krMV0pIHtcblx0XHRcdFx0XHRcdHJlbW92ZU5vZGUob3JpZ2luYWxDaGlsZHJlbltpXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRvbS5pbnNlcnRCZWZvcmUoY2hpbGQsIG9yaWdpbmFsQ2hpbGRyZW5baV0gfHwgbnVsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXG5cdGlmIChrZXllZExlbikge1xuXHRcdGZvciAobGV0IGkgaW4ga2V5ZWQpIGlmIChrZXllZFtpXSkgcmVjb2xsZWN0Tm9kZVRyZWUoa2V5ZWRbaV0pO1xuXHR9XG5cblx0Ly8gcmVtb3ZlIG9ycGhhbmVkIGNoaWxkcmVuXG5cdHdoaWxlIChtaW48PWNoaWxkcmVuTGVuKSB7XG5cdFx0Y2hpbGQgPSBjaGlsZHJlbltjaGlsZHJlbkxlbi0tXTtcblx0XHRpZiAoY2hpbGQpIHJlY29sbGVjdE5vZGVUcmVlKGNoaWxkKTtcblx0fVxufVxuXG5cblxuLyoqIFJlY3Vyc2l2ZWx5IHJlY3ljbGUgKG9yIGp1c3QgdW5tb3VudCkgYSBub2RlIGFuIGl0cyBkZXNjZW5kYW50cy5cbiAqXHRAcGFyYW0ge05vZGV9IG5vZGVcdFx0XHRcdFx0XHRET00gbm9kZSB0byBzdGFydCB1bm1vdW50L3JlbW92YWwgZnJvbVxuICpcdEBwYXJhbSB7Qm9vbGVhbn0gW3VubW91bnRPbmx5PWZhbHNlXVx0SWYgYHRydWVgLCBvbmx5IHRyaWdnZXJzIHVubW91bnQgbGlmZWN5Y2xlLCBza2lwcyByZW1vdmFsXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWNvbGxlY3ROb2RlVHJlZShub2RlLCB1bm1vdW50T25seSkge1xuXHRsZXQgY29tcG9uZW50ID0gbm9kZS5fY29tcG9uZW50O1xuXHRpZiAoY29tcG9uZW50KSB7XG5cdFx0Ly8gaWYgbm9kZSBpcyBvd25lZCBieSBhIENvbXBvbmVudCwgdW5tb3VudCB0aGF0IGNvbXBvbmVudCAoZW5kcyB1cCByZWN1cnNpbmcgYmFjayBoZXJlKVxuXHRcdHVubW91bnRDb21wb25lbnQoY29tcG9uZW50LCAhdW5tb3VudE9ubHkpO1xuXHR9XG5cdGVsc2Uge1xuXHRcdC8vIElmIHRoZSBub2RlJ3MgVk5vZGUgaGFkIGEgcmVmIGZ1bmN0aW9uLCBpbnZva2UgaXQgd2l0aCBudWxsIGhlcmUuXG5cdFx0Ly8gKHRoaXMgaXMgcGFydCBvZiB0aGUgUmVhY3Qgc3BlYywgYW5kIHNtYXJ0IGZvciB1bnNldHRpbmcgcmVmZXJlbmNlcylcblx0XHRpZiAobm9kZVtBVFRSX0tFWV0gJiYgbm9kZVtBVFRSX0tFWV0ucmVmKSBub2RlW0FUVFJfS0VZXS5yZWYobnVsbCk7XG5cblx0XHRpZiAoIXVubW91bnRPbmx5KSB7XG5cdFx0XHRjb2xsZWN0Tm9kZShub2RlKTtcblx0XHR9XG5cblx0XHQvLyBSZWNvbGxlY3QvdW5tb3VudCBhbGwgY2hpbGRyZW4uXG5cdFx0Ly8gLSB3ZSB1c2UgLmxhc3RDaGlsZCBoZXJlIGJlY2F1c2UgaXQgY2F1c2VzIGxlc3MgcmVmbG93IHRoYW4gLmZpcnN0Q2hpbGRcblx0XHQvLyAtIGl0J3MgYWxzbyBjaGVhcGVyIHRoYW4gYWNjZXNzaW5nIHRoZSAuY2hpbGROb2RlcyBMaXZlIE5vZGVMaXN0XG5cdFx0bGV0IGM7XG5cdFx0d2hpbGUgKChjPW5vZGUubGFzdENoaWxkKSkgcmVjb2xsZWN0Tm9kZVRyZWUoYywgdW5tb3VudE9ubHkpO1xuXHR9XG59XG5cblxuXG4vKiogQXBwbHkgZGlmZmVyZW5jZXMgaW4gYXR0cmlidXRlcyBmcm9tIGEgVk5vZGUgdG8gdGhlIGdpdmVuIERPTSBFbGVtZW50LlxuICpcdEBwYXJhbSB7RWxlbWVudH0gZG9tXHRcdEVsZW1lbnQgd2l0aCBhdHRyaWJ1dGVzIHRvIGRpZmYgYGF0dHJzYCBhZ2FpbnN0XG4gKlx0QHBhcmFtIHtPYmplY3R9IGF0dHJzXHRcdFRoZSBkZXNpcmVkIGVuZC1zdGF0ZSBrZXktdmFsdWUgYXR0cmlidXRlIHBhaXJzXG4gKlx0QHBhcmFtIHtPYmplY3R9IG9sZFx0XHRcdEN1cnJlbnQvcHJldmlvdXMgYXR0cmlidXRlcyAoZnJvbSBwcmV2aW91cyBWTm9kZSBvciBlbGVtZW50J3MgcHJvcCBjYWNoZSlcbiAqL1xuZnVuY3Rpb24gZGlmZkF0dHJpYnV0ZXMoZG9tLCBhdHRycywgb2xkKSB7XG5cdC8vIHJlbW92ZSBhdHRyaWJ1dGVzIG5vIGxvbmdlciBwcmVzZW50IG9uIHRoZSB2bm9kZSBieSBzZXR0aW5nIHRoZW0gdG8gdW5kZWZpbmVkXG5cdGZvciAobGV0IG5hbWUgaW4gb2xkKSB7XG5cdFx0aWYgKCEoYXR0cnMgJiYgbmFtZSBpbiBhdHRycykgJiYgb2xkW25hbWVdIT1udWxsKSB7XG5cdFx0XHRzZXRBY2Nlc3Nvcihkb20sIG5hbWUsIG9sZFtuYW1lXSwgb2xkW25hbWVdID0gdW5kZWZpbmVkLCBpc1N2Z01vZGUpO1xuXHRcdH1cblx0fVxuXG5cdC8vIGFkZCBuZXcgJiB1cGRhdGUgY2hhbmdlZCBhdHRyaWJ1dGVzXG5cdGlmIChhdHRycykge1xuXHRcdGZvciAobGV0IG5hbWUgaW4gYXR0cnMpIHtcblx0XHRcdGlmIChuYW1lIT09J2NoaWxkcmVuJyAmJiBuYW1lIT09J2lubmVySFRNTCcgJiYgKCEobmFtZSBpbiBvbGQpIHx8IGF0dHJzW25hbWVdIT09KG5hbWU9PT0ndmFsdWUnIHx8IG5hbWU9PT0nY2hlY2tlZCcgPyBkb21bbmFtZV0gOiBvbGRbbmFtZV0pKSkge1xuXHRcdFx0XHRzZXRBY2Nlc3Nvcihkb20sIG5hbWUsIG9sZFtuYW1lXSwgb2xkW25hbWVdID0gYXR0cnNbbmFtZV0sIGlzU3ZnTW9kZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG4iLCJpbXBvcnQgeyBDb21wb25lbnQgfSBmcm9tICcuLi9jb21wb25lbnQnO1xuXG4vKiogUmV0YWlucyBhIHBvb2wgb2YgQ29tcG9uZW50cyBmb3IgcmUtdXNlLCBrZXllZCBvbiBjb21wb25lbnQgbmFtZS5cbiAqXHROb3RlOiBzaW5jZSBjb21wb25lbnQgbmFtZXMgYXJlIG5vdCB1bmlxdWUgb3IgZXZlbiBuZWNlc3NhcmlseSBhdmFpbGFibGUsIHRoZXNlIGFyZSBwcmltYXJpbHkgYSBmb3JtIG9mIHNoYXJkaW5nLlxuICpcdEBwcml2YXRlXG4gKi9cbmNvbnN0IGNvbXBvbmVudHMgPSB7fTtcblxuXG5leHBvcnQgZnVuY3Rpb24gY29sbGVjdENvbXBvbmVudChjb21wb25lbnQpIHtcblx0bGV0IG5hbWUgPSBjb21wb25lbnQuY29uc3RydWN0b3IubmFtZSxcblx0XHRsaXN0ID0gY29tcG9uZW50c1tuYW1lXTtcblx0aWYgKGxpc3QpIGxpc3QucHVzaChjb21wb25lbnQpO1xuXHRlbHNlIGNvbXBvbmVudHNbbmFtZV0gPSBbY29tcG9uZW50XTtcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQ29tcG9uZW50KEN0b3IsIHByb3BzLCBjb250ZXh0KSB7XG5cdGxldCBpbnN0ID0gbmV3IEN0b3IocHJvcHMsIGNvbnRleHQpLFxuXHRcdGxpc3QgPSBjb21wb25lbnRzW0N0b3IubmFtZV07XG5cdENvbXBvbmVudC5jYWxsKGluc3QsIHByb3BzLCBjb250ZXh0KTtcblx0aWYgKGxpc3QpIHtcblx0XHRmb3IgKGxldCBpPWxpc3QubGVuZ3RoOyBpLS07ICkge1xuXHRcdFx0aWYgKGxpc3RbaV0uY29uc3RydWN0b3I9PT1DdG9yKSB7XG5cdFx0XHRcdGluc3QubmV4dEJhc2UgPSBsaXN0W2ldLm5leHRCYXNlO1xuXHRcdFx0XHRsaXN0LnNwbGljZShpLCAxKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBpbnN0O1xufVxuIiwiaW1wb3J0IHsgU1lOQ19SRU5ERVIsIE5PX1JFTkRFUiwgRk9SQ0VfUkVOREVSLCBBU1lOQ19SRU5ERVIsIEFUVFJfS0VZIH0gZnJvbSAnLi4vY29uc3RhbnRzJztcbmltcG9ydCBvcHRpb25zIGZyb20gJy4uL29wdGlvbnMnO1xuaW1wb3J0IHsgaXNGdW5jdGlvbiwgY2xvbmUsIGV4dGVuZCB9IGZyb20gJy4uL3V0aWwnO1xuaW1wb3J0IHsgZW5xdWV1ZVJlbmRlciB9IGZyb20gJy4uL3JlbmRlci1xdWV1ZSc7XG5pbXBvcnQgeyBnZXROb2RlUHJvcHMgfSBmcm9tICcuL2luZGV4JztcbmltcG9ydCB7IGRpZmYsIG1vdW50cywgZGlmZkxldmVsLCBmbHVzaE1vdW50cywgcmVjb2xsZWN0Tm9kZVRyZWUgfSBmcm9tICcuL2RpZmYnO1xuaW1wb3J0IHsgaXNGdW5jdGlvbmFsQ29tcG9uZW50LCBidWlsZEZ1bmN0aW9uYWxDb21wb25lbnQgfSBmcm9tICcuL2Z1bmN0aW9uYWwtY29tcG9uZW50JztcbmltcG9ydCB7IGNyZWF0ZUNvbXBvbmVudCwgY29sbGVjdENvbXBvbmVudCB9IGZyb20gJy4vY29tcG9uZW50LXJlY3ljbGVyJztcbmltcG9ydCB7IHJlbW92ZU5vZGUgfSBmcm9tICcuLi9kb20vaW5kZXgnO1xuXG5cblxuLyoqIFNldCBhIGNvbXBvbmVudCdzIGBwcm9wc2AgKGdlbmVyYWxseSBkZXJpdmVkIGZyb20gSlNYIGF0dHJpYnV0ZXMpLlxuICpcdEBwYXJhbSB7T2JqZWN0fSBwcm9wc1xuICpcdEBwYXJhbSB7T2JqZWN0fSBbb3B0c11cbiAqXHRAcGFyYW0ge2Jvb2xlYW59IFtvcHRzLnJlbmRlclN5bmM9ZmFsc2VdXHRJZiBgdHJ1ZWAgYW5kIHtAbGluayBvcHRpb25zLnN5bmNDb21wb25lbnRVcGRhdGVzfSBpcyBgdHJ1ZWAsIHRyaWdnZXJzIHN5bmNocm9ub3VzIHJlbmRlcmluZy5cbiAqXHRAcGFyYW0ge2Jvb2xlYW59IFtvcHRzLnJlbmRlcj10cnVlXVx0XHRcdElmIGBmYWxzZWAsIG5vIHJlbmRlciB3aWxsIGJlIHRyaWdnZXJlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldENvbXBvbmVudFByb3BzKGNvbXBvbmVudCwgcHJvcHMsIG9wdHMsIGNvbnRleHQsIG1vdW50QWxsKSB7XG5cdGlmIChjb21wb25lbnQuX2Rpc2FibGUpIHJldHVybjtcblx0Y29tcG9uZW50Ll9kaXNhYmxlID0gdHJ1ZTtcblxuXHRpZiAoKGNvbXBvbmVudC5fX3JlZiA9IHByb3BzLnJlZikpIGRlbGV0ZSBwcm9wcy5yZWY7XG5cdGlmICgoY29tcG9uZW50Ll9fa2V5ID0gcHJvcHMua2V5KSkgZGVsZXRlIHByb3BzLmtleTtcblxuXHRpZiAoIWNvbXBvbmVudC5iYXNlIHx8IG1vdW50QWxsKSB7XG5cdFx0aWYgKGNvbXBvbmVudC5jb21wb25lbnRXaWxsTW91bnQpIGNvbXBvbmVudC5jb21wb25lbnRXaWxsTW91bnQoKTtcblx0fVxuXHRlbHNlIGlmIChjb21wb25lbnQuY29tcG9uZW50V2lsbFJlY2VpdmVQcm9wcykge1xuXHRcdGNvbXBvbmVudC5jb21wb25lbnRXaWxsUmVjZWl2ZVByb3BzKHByb3BzLCBjb250ZXh0KTtcblx0fVxuXG5cdGlmIChjb250ZXh0ICYmIGNvbnRleHQhPT1jb21wb25lbnQuY29udGV4dCkge1xuXHRcdGlmICghY29tcG9uZW50LnByZXZDb250ZXh0KSBjb21wb25lbnQucHJldkNvbnRleHQgPSBjb21wb25lbnQuY29udGV4dDtcblx0XHRjb21wb25lbnQuY29udGV4dCA9IGNvbnRleHQ7XG5cdH1cblxuXHRpZiAoIWNvbXBvbmVudC5wcmV2UHJvcHMpIGNvbXBvbmVudC5wcmV2UHJvcHMgPSBjb21wb25lbnQucHJvcHM7XG5cdGNvbXBvbmVudC5wcm9wcyA9IHByb3BzO1xuXG5cdGNvbXBvbmVudC5fZGlzYWJsZSA9IGZhbHNlO1xuXG5cdGlmIChvcHRzIT09Tk9fUkVOREVSKSB7XG5cdFx0aWYgKG9wdHM9PT1TWU5DX1JFTkRFUiB8fCBvcHRpb25zLnN5bmNDb21wb25lbnRVcGRhdGVzIT09ZmFsc2UgfHwgIWNvbXBvbmVudC5iYXNlKSB7XG5cdFx0XHRyZW5kZXJDb21wb25lbnQoY29tcG9uZW50LCBTWU5DX1JFTkRFUiwgbW91bnRBbGwpO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGVucXVldWVSZW5kZXIoY29tcG9uZW50KTtcblx0XHR9XG5cdH1cblxuXHRpZiAoY29tcG9uZW50Ll9fcmVmKSBjb21wb25lbnQuX19yZWYoY29tcG9uZW50KTtcbn1cblxuXG5cbi8qKiBSZW5kZXIgYSBDb21wb25lbnQsIHRyaWdnZXJpbmcgbmVjZXNzYXJ5IGxpZmVjeWNsZSBldmVudHMgYW5kIHRha2luZyBIaWdoLU9yZGVyIENvbXBvbmVudHMgaW50byBhY2NvdW50LlxuICpcdEBwYXJhbSB7Q29tcG9uZW50fSBjb21wb25lbnRcbiAqXHRAcGFyYW0ge09iamVjdH0gW29wdHNdXG4gKlx0QHBhcmFtIHtib29sZWFufSBbb3B0cy5idWlsZD1mYWxzZV1cdFx0SWYgYHRydWVgLCBjb21wb25lbnQgd2lsbCBidWlsZCBhbmQgc3RvcmUgYSBET00gbm9kZSBpZiBub3QgYWxyZWFkeSBhc3NvY2lhdGVkIHdpdGggb25lLlxuICpcdEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJDb21wb25lbnQoY29tcG9uZW50LCBvcHRzLCBtb3VudEFsbCwgaXNDaGlsZCkge1xuXHRpZiAoY29tcG9uZW50Ll9kaXNhYmxlKSByZXR1cm47XG5cblx0bGV0IHNraXAsIHJlbmRlcmVkLFxuXHRcdHByb3BzID0gY29tcG9uZW50LnByb3BzLFxuXHRcdHN0YXRlID0gY29tcG9uZW50LnN0YXRlLFxuXHRcdGNvbnRleHQgPSBjb21wb25lbnQuY29udGV4dCxcblx0XHRwcmV2aW91c1Byb3BzID0gY29tcG9uZW50LnByZXZQcm9wcyB8fCBwcm9wcyxcblx0XHRwcmV2aW91c1N0YXRlID0gY29tcG9uZW50LnByZXZTdGF0ZSB8fCBzdGF0ZSxcblx0XHRwcmV2aW91c0NvbnRleHQgPSBjb21wb25lbnQucHJldkNvbnRleHQgfHwgY29udGV4dCxcblx0XHRpc1VwZGF0ZSA9IGNvbXBvbmVudC5iYXNlLFxuXHRcdG5leHRCYXNlID0gY29tcG9uZW50Lm5leHRCYXNlLFxuXHRcdGluaXRpYWxCYXNlID0gaXNVcGRhdGUgfHwgbmV4dEJhc2UsXG5cdFx0aW5pdGlhbENoaWxkQ29tcG9uZW50ID0gY29tcG9uZW50Ll9jb21wb25lbnQsXG5cdFx0aW5zdCwgY2Jhc2U7XG5cblx0Ly8gaWYgdXBkYXRpbmdcblx0aWYgKGlzVXBkYXRlKSB7XG5cdFx0Y29tcG9uZW50LnByb3BzID0gcHJldmlvdXNQcm9wcztcblx0XHRjb21wb25lbnQuc3RhdGUgPSBwcmV2aW91c1N0YXRlO1xuXHRcdGNvbXBvbmVudC5jb250ZXh0ID0gcHJldmlvdXNDb250ZXh0O1xuXHRcdGlmIChvcHRzIT09Rk9SQ0VfUkVOREVSXG5cdFx0XHQmJiBjb21wb25lbnQuc2hvdWxkQ29tcG9uZW50VXBkYXRlXG5cdFx0XHQmJiBjb21wb25lbnQuc2hvdWxkQ29tcG9uZW50VXBkYXRlKHByb3BzLCBzdGF0ZSwgY29udGV4dCkgPT09IGZhbHNlKSB7XG5cdFx0XHRza2lwID0gdHJ1ZTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAoY29tcG9uZW50LmNvbXBvbmVudFdpbGxVcGRhdGUpIHtcblx0XHRcdGNvbXBvbmVudC5jb21wb25lbnRXaWxsVXBkYXRlKHByb3BzLCBzdGF0ZSwgY29udGV4dCk7XG5cdFx0fVxuXHRcdGNvbXBvbmVudC5wcm9wcyA9IHByb3BzO1xuXHRcdGNvbXBvbmVudC5zdGF0ZSA9IHN0YXRlO1xuXHRcdGNvbXBvbmVudC5jb250ZXh0ID0gY29udGV4dDtcblx0fVxuXG5cdGNvbXBvbmVudC5wcmV2UHJvcHMgPSBjb21wb25lbnQucHJldlN0YXRlID0gY29tcG9uZW50LnByZXZDb250ZXh0ID0gY29tcG9uZW50Lm5leHRCYXNlID0gbnVsbDtcblx0Y29tcG9uZW50Ll9kaXJ0eSA9IGZhbHNlO1xuXG5cdGlmICghc2tpcCkge1xuXHRcdGlmIChjb21wb25lbnQucmVuZGVyKSByZW5kZXJlZCA9IGNvbXBvbmVudC5yZW5kZXIocHJvcHMsIHN0YXRlLCBjb250ZXh0KTtcblxuXHRcdC8vIGNvbnRleHQgdG8gcGFzcyB0byB0aGUgY2hpbGQsIGNhbiBiZSB1cGRhdGVkIHZpYSAoZ3JhbmQtKXBhcmVudCBjb21wb25lbnRcblx0XHRpZiAoY29tcG9uZW50LmdldENoaWxkQ29udGV4dCkge1xuXHRcdFx0Y29udGV4dCA9IGV4dGVuZChjbG9uZShjb250ZXh0KSwgY29tcG9uZW50LmdldENoaWxkQ29udGV4dCgpKTtcblx0XHR9XG5cblx0XHR3aGlsZSAoaXNGdW5jdGlvbmFsQ29tcG9uZW50KHJlbmRlcmVkKSkge1xuXHRcdFx0cmVuZGVyZWQgPSBidWlsZEZ1bmN0aW9uYWxDb21wb25lbnQocmVuZGVyZWQsIGNvbnRleHQpO1xuXHRcdH1cblxuXHRcdGxldCBjaGlsZENvbXBvbmVudCA9IHJlbmRlcmVkICYmIHJlbmRlcmVkLm5vZGVOYW1lLFxuXHRcdFx0dG9Vbm1vdW50LCBiYXNlO1xuXG5cdFx0aWYgKGlzRnVuY3Rpb24oY2hpbGRDb21wb25lbnQpKSB7XG5cdFx0XHQvLyBzZXQgdXAgaGlnaCBvcmRlciBjb21wb25lbnQgbGlua1xuXG5cdFx0XHRsZXQgY2hpbGRQcm9wcyA9IGdldE5vZGVQcm9wcyhyZW5kZXJlZCk7XG5cdFx0XHRpbnN0ID0gaW5pdGlhbENoaWxkQ29tcG9uZW50O1xuXG5cdFx0XHRpZiAoaW5zdCAmJiBpbnN0LmNvbnN0cnVjdG9yPT09Y2hpbGRDb21wb25lbnQgJiYgY2hpbGRQcm9wcy5rZXk9PWluc3QuX19rZXkpIHtcblx0XHRcdFx0c2V0Q29tcG9uZW50UHJvcHMoaW5zdCwgY2hpbGRQcm9wcywgU1lOQ19SRU5ERVIsIGNvbnRleHQpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHRvVW5tb3VudCA9IGluc3Q7XG5cblx0XHRcdFx0aW5zdCA9IGNyZWF0ZUNvbXBvbmVudChjaGlsZENvbXBvbmVudCwgY2hpbGRQcm9wcywgY29udGV4dCk7XG5cdFx0XHRcdGluc3QubmV4dEJhc2UgPSBpbnN0Lm5leHRCYXNlIHx8IG5leHRCYXNlO1xuXHRcdFx0XHRpbnN0Ll9wYXJlbnRDb21wb25lbnQgPSBjb21wb25lbnQ7XG5cdFx0XHRcdGNvbXBvbmVudC5fY29tcG9uZW50ID0gaW5zdDtcblx0XHRcdFx0c2V0Q29tcG9uZW50UHJvcHMoaW5zdCwgY2hpbGRQcm9wcywgTk9fUkVOREVSLCBjb250ZXh0KTtcblx0XHRcdFx0cmVuZGVyQ29tcG9uZW50KGluc3QsIFNZTkNfUkVOREVSLCBtb3VudEFsbCwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGJhc2UgPSBpbnN0LmJhc2U7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0Y2Jhc2UgPSBpbml0aWFsQmFzZTtcblxuXHRcdFx0Ly8gZGVzdHJveSBoaWdoIG9yZGVyIGNvbXBvbmVudCBsaW5rXG5cdFx0XHR0b1VubW91bnQgPSBpbml0aWFsQ2hpbGRDb21wb25lbnQ7XG5cdFx0XHRpZiAodG9Vbm1vdW50KSB7XG5cdFx0XHRcdGNiYXNlID0gY29tcG9uZW50Ll9jb21wb25lbnQgPSBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaW5pdGlhbEJhc2UgfHwgb3B0cz09PVNZTkNfUkVOREVSKSB7XG5cdFx0XHRcdGlmIChjYmFzZSkgY2Jhc2UuX2NvbXBvbmVudCA9IG51bGw7XG5cdFx0XHRcdGJhc2UgPSBkaWZmKGNiYXNlLCByZW5kZXJlZCwgY29udGV4dCwgbW91bnRBbGwgfHwgIWlzVXBkYXRlLCBpbml0aWFsQmFzZSAmJiBpbml0aWFsQmFzZS5wYXJlbnROb2RlLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaW5pdGlhbEJhc2UgJiYgYmFzZSE9PWluaXRpYWxCYXNlICYmIGluc3QhPT1pbml0aWFsQ2hpbGRDb21wb25lbnQpIHtcblx0XHRcdGxldCBiYXNlUGFyZW50ID0gaW5pdGlhbEJhc2UucGFyZW50Tm9kZTtcblx0XHRcdGlmIChiYXNlUGFyZW50ICYmIGJhc2UhPT1iYXNlUGFyZW50KSB7XG5cdFx0XHRcdGJhc2VQYXJlbnQucmVwbGFjZUNoaWxkKGJhc2UsIGluaXRpYWxCYXNlKTtcblxuXHRcdFx0XHRpZiAoIXRvVW5tb3VudCkge1xuXHRcdFx0XHRcdGluaXRpYWxCYXNlLl9jb21wb25lbnQgPSBudWxsO1xuXHRcdFx0XHRcdHJlY29sbGVjdE5vZGVUcmVlKGluaXRpYWxCYXNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0b1VubW91bnQpIHtcblx0XHRcdHVubW91bnRDb21wb25lbnQodG9Vbm1vdW50LCBiYXNlIT09aW5pdGlhbEJhc2UpO1xuXHRcdH1cblxuXHRcdGNvbXBvbmVudC5iYXNlID0gYmFzZTtcblx0XHRpZiAoYmFzZSAmJiAhaXNDaGlsZCkge1xuXHRcdFx0bGV0IGNvbXBvbmVudFJlZiA9IGNvbXBvbmVudCxcblx0XHRcdFx0dCA9IGNvbXBvbmVudDtcblx0XHRcdHdoaWxlICgodD10Ll9wYXJlbnRDb21wb25lbnQpKSB7XG5cdFx0XHRcdChjb21wb25lbnRSZWYgPSB0KS5iYXNlID0gYmFzZTtcblx0XHRcdH1cblx0XHRcdGJhc2UuX2NvbXBvbmVudCA9IGNvbXBvbmVudFJlZjtcblx0XHRcdGJhc2UuX2NvbXBvbmVudENvbnN0cnVjdG9yID0gY29tcG9uZW50UmVmLmNvbnN0cnVjdG9yO1xuXHRcdH1cblx0fVxuXG5cdGlmICghaXNVcGRhdGUgfHwgbW91bnRBbGwpIHtcblx0XHRtb3VudHMudW5zaGlmdChjb21wb25lbnQpO1xuXHR9XG5cdGVsc2UgaWYgKCFza2lwKSB7XG5cdFx0aWYgKGNvbXBvbmVudC5jb21wb25lbnREaWRVcGRhdGUpIHtcblx0XHRcdGNvbXBvbmVudC5jb21wb25lbnREaWRVcGRhdGUocHJldmlvdXNQcm9wcywgcHJldmlvdXNTdGF0ZSwgcHJldmlvdXNDb250ZXh0KTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMuYWZ0ZXJVcGRhdGUpIG9wdGlvbnMuYWZ0ZXJVcGRhdGUoY29tcG9uZW50KTtcblx0fVxuXG5cdGxldCBjYiA9IGNvbXBvbmVudC5fcmVuZGVyQ2FsbGJhY2tzLCBmbjtcblx0aWYgKGNiKSB3aGlsZSAoIChmbiA9IGNiLnBvcCgpKSApIGZuLmNhbGwoY29tcG9uZW50KTtcblxuXHRpZiAoIWRpZmZMZXZlbCAmJiAhaXNDaGlsZCkgZmx1c2hNb3VudHMoKTtcbn1cblxuXG5cbi8qKiBBcHBseSB0aGUgQ29tcG9uZW50IHJlZmVyZW5jZWQgYnkgYSBWTm9kZSB0byB0aGUgRE9NLlxuICpcdEBwYXJhbSB7RWxlbWVudH0gZG9tXHRUaGUgRE9NIG5vZGUgdG8gbXV0YXRlXG4gKlx0QHBhcmFtIHtWTm9kZX0gdm5vZGVcdEEgQ29tcG9uZW50LXJlZmVyZW5jaW5nIFZOb2RlXG4gKlx0QHJldHVybnMge0VsZW1lbnR9IGRvbVx0VGhlIGNyZWF0ZWQvbXV0YXRlZCBlbGVtZW50XG4gKlx0QHByaXZhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkQ29tcG9uZW50RnJvbVZOb2RlKGRvbSwgdm5vZGUsIGNvbnRleHQsIG1vdW50QWxsKSB7XG5cdGxldCBjID0gZG9tICYmIGRvbS5fY29tcG9uZW50LFxuXHRcdG9sZERvbSA9IGRvbSxcblx0XHRpc0RpcmVjdE93bmVyID0gYyAmJiBkb20uX2NvbXBvbmVudENvbnN0cnVjdG9yPT09dm5vZGUubm9kZU5hbWUsXG5cdFx0aXNPd25lciA9IGlzRGlyZWN0T3duZXIsXG5cdFx0cHJvcHMgPSBnZXROb2RlUHJvcHModm5vZGUpO1xuXHR3aGlsZSAoYyAmJiAhaXNPd25lciAmJiAoYz1jLl9wYXJlbnRDb21wb25lbnQpKSB7XG5cdFx0aXNPd25lciA9IGMuY29uc3RydWN0b3I9PT12bm9kZS5ub2RlTmFtZTtcblx0fVxuXG5cdGlmIChjICYmIGlzT3duZXIgJiYgKCFtb3VudEFsbCB8fCBjLl9jb21wb25lbnQpKSB7XG5cdFx0c2V0Q29tcG9uZW50UHJvcHMoYywgcHJvcHMsIEFTWU5DX1JFTkRFUiwgY29udGV4dCwgbW91bnRBbGwpO1xuXHRcdGRvbSA9IGMuYmFzZTtcblx0fVxuXHRlbHNlIHtcblx0XHRpZiAoYyAmJiAhaXNEaXJlY3RPd25lcikge1xuXHRcdFx0dW5tb3VudENvbXBvbmVudChjLCB0cnVlKTtcblx0XHRcdGRvbSA9IG9sZERvbSA9IG51bGw7XG5cdFx0fVxuXG5cdFx0YyA9IGNyZWF0ZUNvbXBvbmVudCh2bm9kZS5ub2RlTmFtZSwgcHJvcHMsIGNvbnRleHQpO1xuXHRcdGlmIChkb20gJiYgIWMubmV4dEJhc2UpIHtcblx0XHRcdGMubmV4dEJhc2UgPSBkb207XG5cdFx0XHQvLyBwYXNzaW5nIGRvbS9vbGREb20gYXMgbmV4dEJhc2Ugd2lsbCByZWN5Y2xlIGl0IGlmIHVudXNlZCwgc28gYnlwYXNzIHJlY3ljbGluZyBvbiBMMjQxOlxuXHRcdFx0b2xkRG9tID0gbnVsbDtcblx0XHR9XG5cdFx0c2V0Q29tcG9uZW50UHJvcHMoYywgcHJvcHMsIFNZTkNfUkVOREVSLCBjb250ZXh0LCBtb3VudEFsbCk7XG5cdFx0ZG9tID0gYy5iYXNlO1xuXG5cdFx0aWYgKG9sZERvbSAmJiBkb20hPT1vbGREb20pIHtcblx0XHRcdG9sZERvbS5fY29tcG9uZW50ID0gbnVsbDtcblx0XHRcdHJlY29sbGVjdE5vZGVUcmVlKG9sZERvbSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGRvbTtcbn1cblxuXG5cbi8qKiBSZW1vdmUgYSBjb21wb25lbnQgZnJvbSB0aGUgRE9NIGFuZCByZWN5Y2xlIGl0LlxuICpcdEBwYXJhbSB7RWxlbWVudH0gZG9tXHRcdFx0QSBET00gbm9kZSBmcm9tIHdoaWNoIHRvIHVubW91bnQgdGhlIGdpdmVuIENvbXBvbmVudFxuICpcdEBwYXJhbSB7Q29tcG9uZW50fSBjb21wb25lbnRcdFRoZSBDb21wb25lbnQgaW5zdGFuY2UgdG8gdW5tb3VudFxuICpcdEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1bm1vdW50Q29tcG9uZW50KGNvbXBvbmVudCwgcmVtb3ZlKSB7XG5cdGlmIChvcHRpb25zLmJlZm9yZVVubW91bnQpIG9wdGlvbnMuYmVmb3JlVW5tb3VudChjb21wb25lbnQpO1xuXG5cdC8vIGNvbnNvbGUubG9nKGAke3JlbW92ZT8nUmVtb3ZpbmcnOidVbm1vdW50aW5nJ30gY29tcG9uZW50OiAke2NvbXBvbmVudC5jb25zdHJ1Y3Rvci5uYW1lfWApO1xuXHRsZXQgYmFzZSA9IGNvbXBvbmVudC5iYXNlO1xuXG5cdGNvbXBvbmVudC5fZGlzYWJsZSA9IHRydWU7XG5cblx0aWYgKGNvbXBvbmVudC5jb21wb25lbnRXaWxsVW5tb3VudCkgY29tcG9uZW50LmNvbXBvbmVudFdpbGxVbm1vdW50KCk7XG5cblx0Y29tcG9uZW50LmJhc2UgPSBudWxsO1xuXG5cdC8vIHJlY3Vyc2l2ZWx5IHRlYXIgZG93biAmIHJlY29sbGVjdCBoaWdoLW9yZGVyIGNvbXBvbmVudCBjaGlsZHJlbjpcblx0bGV0IGlubmVyID0gY29tcG9uZW50Ll9jb21wb25lbnQ7XG5cdGlmIChpbm5lcikge1xuXHRcdHVubW91bnRDb21wb25lbnQoaW5uZXIsIHJlbW92ZSk7XG5cdH1cblx0ZWxzZSBpZiAoYmFzZSkge1xuXHRcdGlmIChiYXNlW0FUVFJfS0VZXSAmJiBiYXNlW0FUVFJfS0VZXS5yZWYpIGJhc2VbQVRUUl9LRVldLnJlZihudWxsKTtcblxuXHRcdGNvbXBvbmVudC5uZXh0QmFzZSA9IGJhc2U7XG5cblx0XHRpZiAocmVtb3ZlKSB7XG5cdFx0XHRyZW1vdmVOb2RlKGJhc2UpO1xuXHRcdFx0Y29sbGVjdENvbXBvbmVudChjb21wb25lbnQpO1xuXHRcdH1cblx0XHRsZXQgYztcblx0XHR3aGlsZSAoKGM9YmFzZS5sYXN0Q2hpbGQpKSByZWNvbGxlY3ROb2RlVHJlZShjLCAhcmVtb3ZlKTtcblx0XHQvLyByZW1vdmVPcnBoYW5lZENoaWxkcmVuKGJhc2UuY2hpbGROb2RlcywgdHJ1ZSk7XG5cdH1cblxuXHRpZiAoY29tcG9uZW50Ll9fcmVmKSBjb21wb25lbnQuX19yZWYobnVsbCk7XG5cdGlmIChjb21wb25lbnQuY29tcG9uZW50RGlkVW5tb3VudCkgY29tcG9uZW50LmNvbXBvbmVudERpZFVubW91bnQoKTtcbn1cbiIsImltcG9ydCB7IEZPUkNFX1JFTkRFUiB9IGZyb20gJy4vY29uc3RhbnRzJztcbmltcG9ydCB7IGV4dGVuZCwgY2xvbmUsIGlzRnVuY3Rpb24gfSBmcm9tICcuL3V0aWwnO1xuaW1wb3J0IHsgY3JlYXRlTGlua2VkU3RhdGUgfSBmcm9tICcuL2xpbmtlZC1zdGF0ZSc7XG5pbXBvcnQgeyByZW5kZXJDb21wb25lbnQgfSBmcm9tICcuL3Zkb20vY29tcG9uZW50JztcbmltcG9ydCB7IGVucXVldWVSZW5kZXIgfSBmcm9tICcuL3JlbmRlci1xdWV1ZSc7XG5cbi8qKiBCYXNlIENvbXBvbmVudCBjbGFzcywgZm9yIGhlIEVTNiBDbGFzcyBtZXRob2Qgb2YgY3JlYXRpbmcgQ29tcG9uZW50c1xuICpcdEBwdWJsaWNcbiAqXG4gKlx0QGV4YW1wbGVcbiAqXHRjbGFzcyBNeUZvbyBleHRlbmRzIENvbXBvbmVudCB7XG4gKlx0XHRyZW5kZXIocHJvcHMsIHN0YXRlKSB7XG4gKlx0XHRcdHJldHVybiA8ZGl2IC8+O1xuICpcdFx0fVxuICpcdH1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIENvbXBvbmVudChwcm9wcywgY29udGV4dCkge1xuXHQvKiogQHByaXZhdGUgKi9cblx0dGhpcy5fZGlydHkgPSB0cnVlO1xuXHQvLyAvKiogQHB1YmxpYyAqL1xuXHQvLyB0aGlzLl9kaXNhYmxlUmVuZGVyaW5nID0gZmFsc2U7XG5cdC8vIC8qKiBAcHVibGljICovXG5cdC8vIHRoaXMucHJldlN0YXRlID0gdGhpcy5wcmV2UHJvcHMgPSB0aGlzLnByZXZDb250ZXh0ID0gdGhpcy5iYXNlID0gdGhpcy5uZXh0QmFzZSA9IHRoaXMuX3BhcmVudENvbXBvbmVudCA9IHRoaXMuX2NvbXBvbmVudCA9IHRoaXMuX19yZWYgPSB0aGlzLl9fa2V5ID0gdGhpcy5fbGlua2VkU3RhdGVzID0gdGhpcy5fcmVuZGVyQ2FsbGJhY2tzID0gbnVsbDtcblx0LyoqIEBwdWJsaWMgKi9cblx0dGhpcy5jb250ZXh0ID0gY29udGV4dDtcblx0LyoqIEB0eXBlIHtvYmplY3R9ICovXG5cdHRoaXMucHJvcHMgPSBwcm9wcztcblx0LyoqIEB0eXBlIHtvYmplY3R9ICovXG5cdGlmICghdGhpcy5zdGF0ZSkgdGhpcy5zdGF0ZSA9IHt9O1xufVxuXG5cbmV4dGVuZChDb21wb25lbnQucHJvdG90eXBlLCB7XG5cblx0LyoqIFJldHVybnMgYSBgYm9vbGVhbmAgdmFsdWUgaW5kaWNhdGluZyBpZiB0aGUgY29tcG9uZW50IHNob3VsZCByZS1yZW5kZXIgd2hlbiByZWNlaXZpbmcgdGhlIGdpdmVuIGBwcm9wc2AgYW5kIGBzdGF0ZWAuXG5cdCAqXHRAcGFyYW0ge29iamVjdH0gbmV4dFByb3BzXG5cdCAqXHRAcGFyYW0ge29iamVjdH0gbmV4dFN0YXRlXG5cdCAqXHRAcGFyYW0ge29iamVjdH0gbmV4dENvbnRleHRcblx0ICpcdEByZXR1cm5zIHtCb29sZWFufSBzaG91bGQgdGhlIGNvbXBvbmVudCByZS1yZW5kZXJcblx0ICpcdEBuYW1lIHNob3VsZENvbXBvbmVudFVwZGF0ZVxuXHQgKlx0QGZ1bmN0aW9uXG5cdCAqL1xuXHQvLyBzaG91bGRDb21wb25lbnRVcGRhdGUoKSB7XG5cdC8vIFx0cmV0dXJuIHRydWU7XG5cdC8vIH0sXG5cblxuXHQvKiogUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgc2V0cyBhIHN0YXRlIHByb3BlcnR5IHdoZW4gY2FsbGVkLlxuXHQgKlx0Q2FsbGluZyBsaW5rU3RhdGUoKSByZXBlYXRlZGx5IHdpdGggdGhlIHNhbWUgYXJndW1lbnRzIHJldHVybnMgYSBjYWNoZWQgbGluayBmdW5jdGlvbi5cblx0ICpcblx0ICpcdFByb3ZpZGVzIHNvbWUgYnVpbHQtaW4gc3BlY2lhbCBjYXNlczpcblx0ICpcdFx0LSBDaGVja2JveGVzIGFuZCByYWRpbyBidXR0b25zIGxpbmsgdGhlaXIgYm9vbGVhbiBgY2hlY2tlZGAgdmFsdWVcblx0ICpcdFx0LSBJbnB1dHMgYXV0b21hdGljYWxseSBsaW5rIHRoZWlyIGB2YWx1ZWAgcHJvcGVydHlcblx0ICpcdFx0LSBFdmVudCBwYXRocyBmYWxsIGJhY2sgdG8gYW55IGFzc29jaWF0ZWQgQ29tcG9uZW50IGlmIG5vdCBmb3VuZCBvbiBhbiBlbGVtZW50XG5cdCAqXHRcdC0gSWYgbGlua2VkIHZhbHVlIGlzIGEgZnVuY3Rpb24sIHdpbGwgaW52b2tlIGl0IGFuZCB1c2UgdGhlIHJlc3VsdFxuXHQgKlxuXHQgKlx0QHBhcmFtIHtzdHJpbmd9IGtleVx0XHRcdFx0VGhlIHBhdGggdG8gc2V0IC0gY2FuIGJlIGEgZG90LW5vdGF0ZWQgZGVlcCBrZXlcblx0ICpcdEBwYXJhbSB7c3RyaW5nfSBbZXZlbnRQYXRoXVx0XHRJZiBzZXQsIGF0dGVtcHRzIHRvIGZpbmQgdGhlIG5ldyBzdGF0ZSB2YWx1ZSBhdCBhIGdpdmVuIGRvdC1ub3RhdGVkIHBhdGggd2l0aGluIHRoZSBvYmplY3QgcGFzc2VkIHRvIHRoZSBsaW5rZWRTdGF0ZSBzZXR0ZXIuXG5cdCAqXHRAcmV0dXJucyB7ZnVuY3Rpb259IGxpbmtTdGF0ZVNldHRlcihlKVxuXHQgKlxuXHQgKlx0QGV4YW1wbGUgVXBkYXRlIGEgXCJ0ZXh0XCIgc3RhdGUgdmFsdWUgd2hlbiBhbiBpbnB1dCBjaGFuZ2VzOlxuXHQgKlx0XHQ8aW5wdXQgb25DaGFuZ2U9eyB0aGlzLmxpbmtTdGF0ZSgndGV4dCcpIH0gLz5cblx0ICpcblx0ICpcdEBleGFtcGxlIFNldCBhIGRlZXAgc3RhdGUgdmFsdWUgb24gY2xpY2tcblx0ICpcdFx0PGJ1dHRvbiBvbkNsaWNrPXsgdGhpcy5saW5rU3RhdGUoJ3RvdWNoLmNvb3JkcycsICd0b3VjaGVzLjAnKSB9PlRhcDwvYnV0dG9uXG5cdCAqL1xuXHRsaW5rU3RhdGUoa2V5LCBldmVudFBhdGgpIHtcblx0XHRsZXQgYyA9IHRoaXMuX2xpbmtlZFN0YXRlcyB8fCAodGhpcy5fbGlua2VkU3RhdGVzID0ge30pO1xuXHRcdHJldHVybiBjW2tleStldmVudFBhdGhdIHx8IChjW2tleStldmVudFBhdGhdID0gY3JlYXRlTGlua2VkU3RhdGUodGhpcywga2V5LCBldmVudFBhdGgpKTtcblx0fSxcblxuXG5cdC8qKiBVcGRhdGUgY29tcG9uZW50IHN0YXRlIGJ5IGNvcHlpbmcgcHJvcGVydGllcyBmcm9tIGBzdGF0ZWAgdG8gYHRoaXMuc3RhdGVgLlxuXHQgKlx0QHBhcmFtIHtvYmplY3R9IHN0YXRlXHRcdEEgaGFzaCBvZiBzdGF0ZSBwcm9wZXJ0aWVzIHRvIHVwZGF0ZSB3aXRoIG5ldyB2YWx1ZXNcblx0ICovXG5cdHNldFN0YXRlKHN0YXRlLCBjYWxsYmFjaykge1xuXHRcdGxldCBzID0gdGhpcy5zdGF0ZTtcblx0XHRpZiAoIXRoaXMucHJldlN0YXRlKSB0aGlzLnByZXZTdGF0ZSA9IGNsb25lKHMpO1xuXHRcdGV4dGVuZChzLCBpc0Z1bmN0aW9uKHN0YXRlKSA/IHN0YXRlKHMsIHRoaXMucHJvcHMpIDogc3RhdGUpO1xuXHRcdGlmIChjYWxsYmFjaykgKHRoaXMuX3JlbmRlckNhbGxiYWNrcyA9ICh0aGlzLl9yZW5kZXJDYWxsYmFja3MgfHwgW10pKS5wdXNoKGNhbGxiYWNrKTtcblx0XHRlbnF1ZXVlUmVuZGVyKHRoaXMpO1xuXHR9LFxuXG5cblx0LyoqIEltbWVkaWF0ZWx5IHBlcmZvcm0gYSBzeW5jaHJvbm91cyByZS1yZW5kZXIgb2YgdGhlIGNvbXBvbmVudC5cblx0ICpcdEBwcml2YXRlXG5cdCAqL1xuXHRmb3JjZVVwZGF0ZSgpIHtcblx0XHRyZW5kZXJDb21wb25lbnQodGhpcywgRk9SQ0VfUkVOREVSKTtcblx0fSxcblxuXG5cdC8qKiBBY2NlcHRzIGBwcm9wc2AgYW5kIGBzdGF0ZWAsIGFuZCByZXR1cm5zIGEgbmV3IFZpcnR1YWwgRE9NIHRyZWUgdG8gYnVpbGQuXG5cdCAqXHRWaXJ0dWFsIERPTSBpcyBnZW5lcmFsbHkgY29uc3RydWN0ZWQgdmlhIFtKU1hdKGh0dHA6Ly9qYXNvbmZvcm1hdC5jb20vd3RmLWlzLWpzeCkuXG5cdCAqXHRAcGFyYW0ge29iamVjdH0gcHJvcHNcdFx0UHJvcHMgKGVnOiBKU1ggYXR0cmlidXRlcykgcmVjZWl2ZWQgZnJvbSBwYXJlbnQgZWxlbWVudC9jb21wb25lbnRcblx0ICpcdEBwYXJhbSB7b2JqZWN0fSBzdGF0ZVx0XHRUaGUgY29tcG9uZW50J3MgY3VycmVudCBzdGF0ZVxuXHQgKlx0QHBhcmFtIHtvYmplY3R9IGNvbnRleHRcdFx0Q29udGV4dCBvYmplY3QgKGlmIGEgcGFyZW50IGNvbXBvbmVudCBoYXMgcHJvdmlkZWQgY29udGV4dClcblx0ICpcdEByZXR1cm5zIFZOb2RlXG5cdCAqL1xuXHRyZW5kZXIoKSB7fVxuXG59KTtcbiIsImltcG9ydCB7IGRpZmYgfSBmcm9tICcuL3Zkb20vZGlmZic7XG5cbi8qKiBSZW5kZXIgSlNYIGludG8gYSBgcGFyZW50YCBFbGVtZW50LlxuICpcdEBwYXJhbSB7Vk5vZGV9IHZub2RlXHRcdEEgKEpTWCkgVk5vZGUgdG8gcmVuZGVyXG4gKlx0QHBhcmFtIHtFbGVtZW50fSBwYXJlbnRcdFx0RE9NIGVsZW1lbnQgdG8gcmVuZGVyIGludG9cbiAqXHRAcGFyYW0ge0VsZW1lbnR9IFttZXJnZV1cdEF0dGVtcHQgdG8gcmUtdXNlIGFuIGV4aXN0aW5nIERPTSB0cmVlIHJvb3RlZCBhdCBgbWVyZ2VgXG4gKlx0QHB1YmxpY1xuICpcbiAqXHRAZXhhbXBsZVxuICpcdC8vIHJlbmRlciBhIGRpdiBpbnRvIDxib2R5PjpcbiAqXHRyZW5kZXIoPGRpdiBpZD1cImhlbGxvXCI+aGVsbG8hPC9kaXY+LCBkb2N1bWVudC5ib2R5KTtcbiAqXG4gKlx0QGV4YW1wbGVcbiAqXHQvLyByZW5kZXIgYSBcIlRoaW5nXCIgY29tcG9uZW50IGludG8gI2ZvbzpcbiAqXHRjb25zdCBUaGluZyA9ICh7IG5hbWUgfSkgPT4gPHNwYW4+eyBuYW1lIH08L3NwYW4+O1xuICpcdHJlbmRlcig8VGhpbmcgbmFtZT1cIm9uZVwiIC8+LCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjZm9vJykpO1xuICovXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyKHZub2RlLCBwYXJlbnQsIG1lcmdlKSB7XG5cdHJldHVybiBkaWZmKG1lcmdlLCB2bm9kZSwge30sIGZhbHNlLCBwYXJlbnQpO1xufVxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gb25Eb21SZWFkeShmdW5jKSB7XG4gIGlmIChbJ2NvbXBsZXRlJywgJ2xvYWRlZCcsICdpbnRlcmFjdGl2ZSddLmluZGV4T2YoZG9jdW1lbnQucmVhZHlTdGF0ZSkgPiAtMSkge1xuICAgIGZ1bmMoKTtcbiAgfSBlbHNlIHtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgZnVuYyk7XG4gIH1cbn1cbiIsImltcG9ydCB7IGgsIHJlbmRlciB9IGZyb20gJ3ByZWFjdCc7XG5cbmltcG9ydCBvbkRvbVJlYWR5IGZyb20gJy4vYXBwL3JlYWR5Jztcblxub25Eb21SZWFkeSgoKSA9PiB7XG4gIHJlbmRlcigoXG4gICAgPGRpdiBpZD1cImZvb1wiPlxuICAgICAgICA8c3Bhbj5IZWxsbywgd29ybGQhPC9zcGFuPlxuICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9eyBlID0+IGFsZXJ0KFwiaGV5IVwiKSB9PkNsaWNrIE1lPC9idXR0b24+XG4gICAgPC9kaXY+XG4pLCBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXBwJykpO1xufSk7XG4iXSwibmFtZXMiOlsib25Eb21SZWFkeSIsImZ1bmMiLCJpbmRleE9mIiwiZG9jdW1lbnQiLCJyZWFkeVN0YXRlIiwiYWRkRXZl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
