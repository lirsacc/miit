import { h, Component } from 'preact';
import mdl from 'material-design-lite/material';
import { Button } from 'preact-mdl';

export default function LoginPage(props) {
  return (
    <section class="appView flex flex-column justify-between">
      <h1 class="flex-auto center">Miit</h1>
      <div class="flex-auto">
        <Button>Login</Button>
      </div>
    </section>
  );
}
