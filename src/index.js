import { h, render } from 'preact';

import onDomReady from './app/ready';

onDomReady(() => {
  render((
    <div id="foo">
        <span>Hello, world!</span>
        <button onClick={ e => alert("hey!") }>Click Me</button>
    </div>
), document.getElementById('app'));
});
