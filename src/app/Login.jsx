import { h, Component } from 'preact';
import mdl from 'material-design-lite/material';
import { Button } from 'preact-mdl';

export default function LoginPage(props) {
  return (<section className="view">
    <h1>Miit</h1>
    <div>
      <Button>Login</Button>
    </div>
  </section>);
}
