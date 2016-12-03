import { h, Component } from 'preact';
import mdl from 'material-design-lite/material';
import { Button } from 'preact-mdl';

export default class LoginPage extends Component {

  componentWillMount() {
    console.log("CWM");
    this.props.update({loading: true});
    FB.getLoginStatus((response) => {
      console.log(response);
      const status = response.status;
      if (status === 'not_authorized') {
        this.props.update({user: null, loading: false});
      } else if (status === 'unknown') {
        this.props.update({user: null, loading: false});
      } else if (status === 'connected') {
        if (this.props.appState.user) {
          this.props.goTo('/');
          this.props.update({loading: false});
        } else {
          const {accessToken} = response.authResponse;
          FB.api('/me?fields=picture,name', (response) => {
            console.log("R", response);
            this.props.update({
              loading: false,
              user: {
                name: response.name,
                picture: response.picture,
                id: response.id,
                token: accessToken,
              }
            });
            this.props.goTo('/');
          });
        }
      } else {
        throw new Error(`Unkown status ${status}`);
      }
    });
  }

  requestLogin = () => {
    this.props.update({loading: true});
    FB.login((response) => {
      console.log(response);
      this.props.update({loading: false});
    });
  }

  render() {
    return (
      <section class="appView flex flex-column justify-between p1">
        <h1 class="flex-auto center">Miit</h1>
        <div class="flex-auto mx-auto">
          <Button colored raised ripple onClick={this.requestLogin}>
            Login with Facebook
          </Button>
        </div>
      </section>
    );
  }
}
