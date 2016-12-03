import { h, render } from 'preact';

import onDomReady from './app/ready';
import LoginPage from './app/Login.jsx';

console.log(LoginPage);
const node = document.getElementById('app')
console.log(node);

onDomReady(() => {
  console.log("HEY");
  render((
    <LoginPage/>
  ), node);
});
