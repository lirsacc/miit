import { h, render, Component } from 'preact';
import {Router, route} from 'preact-router';
import { Layout, Navigation, Card, Button, Icon, TextField, List } from 'preact-mdl';
import updeep from 'updeep';

window._route = route;

import onDomReady from './app/ready';
import LoginPage from './app/Login';
import Categories from './app/Categories';

function NotFound() { return (<p>Not found</p>); }

function Home(props) {

  const logout = () => {
    props.update({
      user: null,
    });
  }

  return (
    <section className="appView p1">
      <pre>{JSON.stringify(props.appState.user, null, 4)}</pre>
      <div className="center mx-auto">
        <Button raised colored accent onClick={logout}>
          Logout
        </Button>
      </div>
    </section>
  );
}

function loggedInOnly(Component) {
  return function(props) {
    const user = props.appState.user;
    if (!user) {
      setTimeout(() => route('/login'));
      return null;
    } else {
      return <Component {...props}/>;
    }
  }
}

const _Home = loggedInOnly(Home);

const initialState = {
  loading: false,
  user: null,
  categories: {
    '18 +': {
      name: '18 +',
      description: 'Kinky shit for ya!',
      color: 'hsla(338, 100%, 44%, 1.0)',
      people: 24,
    },
    'Food and drinks': {
      name: 'Food and drinks',
      description: 'Fancy some grub?',
      color: 'hsla(212, 88%, 53%, 1.0)',
      peopleNearby: 10,
    },
    'Culture': {
      name: 'Culture',
      description: 'Like to learn stuff?',
      color: 'hsla(42, 99%, 52%, 1.0)',
      peopleNearby: 3,
    },
    'Outdoors & Sports': {
      name: 'Outdoors & Sports',
      description: 'GTFO!',
      color: 'hsla(90, 52%, 48%, 1.0)',
      peopleNearby: 42,
    }
  },
  categorySelection: {},
  events: {}
};


class App extends Component {
  constructor(props) {
    super(props);
    const savedState = localStorage.getItem('miitState');
    if (savedState) {
      this.state = JSON.parse(savedState);
    } else {
      this.state = initialState;
    }
  }

  update = (changeset) => {
    if (changeset) {
      const nextState = updeep(changeset, this.state);
      if (nextState !== this.state) {
        this.setState(nextState);
        localStorage.setItem('miitState', JSON.stringify({
          ...this.state,
          loading: false,
        }));
      }
    }
  }

  goTo = (path) => {
    route(path);
  }

  render() {
    console.log(this.state);
    return (
      <Layout fixed-header>

        <Layout.Header>
          <Layout.HeaderRow>
            <Layout.Title>
              <img src="/static/img/miitnow_txt.png" alt="miitnow" style="height:20px;"></img>
            </Layout.Title>
            <Layout.Spacer/>
            { this.state.user &&
              <Button icon>
                <Icon icon='favorite border'></Icon>
              </Button>
            }
            <Layout.Spacer/>
            { this.state.user &&
              <Button onClick={() => route('/events')} icon>
                <Icon icon='map'></Icon>
              </Button>
            }
          </Layout.HeaderRow>

        </Layout.Header>

        <Layout.Content>
          { this.state.loading ?
            <p className="p1 center mx-auto border-box">
              Loading
            </p>
            :
            <Router>
              <LoginPage
                path="/login"
                appState={this.state}
                update={this.update}
                goTo={this.goTo}/>
              <_Home appState={this.state} update={this.update} path=""/>
              <Categories appState={this.state} update={this.update} path="/categories" goTo={this.goTo}/>
              <NotFound appState={this.state} update={this.update} type="404" default/>
            </Router>
          }
        </Layout.Content>
      </Layout>
    );
  }
}


onDomReady(() => {
  FB.init({
    appId      : '1160090270753292',
    xfbml      : true,
    version    : 'v2.6',
    status     : true
  });
  const node = document.getElementById('app');
  render(<App/>, node);
});
