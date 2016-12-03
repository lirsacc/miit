import { h, render } from 'preact';
import Router from 'preact-router';

import LoginPage from './Login';
import Activities from './Activities'

function NotFound() { return (<p>Not found</p>); }
function Home() { return (<p>Home</p>); }

export default function Root(props) {
  return (
    <div className="app">
      <Router>
        <Home path=""/>
        <LoginPage path="/login"/>
        <Activities path="/activities"/>
        <NotFound type="404" default/>
      </Router>
    </div>
  );
}
