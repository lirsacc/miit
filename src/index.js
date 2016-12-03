import { h, render } from 'preact';

import onDomReady from './app/ready';
import Root from './app/Root.jsx';

onDomReady(() => {
  const node = document.getElementById('app')
  console.log(node);
  render(<Root/>, node);
});
