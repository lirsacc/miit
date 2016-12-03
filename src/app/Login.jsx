import { h, Component } from 'preact';
import mdl from 'material-design-lite/material';
import { Button } from 'preact-mdl';

export default function LoginPage(props) {
  return (
    <section className="appView flex flex-column justify-between">
      <h1 className="flex-auto center">Miit</h1>
      <div className="flex-auto">
        <Button>Login</Button>
      </div>
    </section>
  );
}
