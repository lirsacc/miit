import { h, render } from 'preact';
import Router from 'preact-router';

import LoginPage from './Login';

function NotFound() { return (<p>Not found</p>); }
function Home() { return (<p>Home</p>); }

export default function Root(props) {
  return (
    <div className="app">
      <Router>
        <Home path=""/>
        <LoginPage path="/login"/>
        <NotFound type="404" default/>
      </Router>
    </div>
  );
}
