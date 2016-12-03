import { h, render } from 'preact';
import Router from 'preact-router';
import { Layout, Navigation, Card, Button, Icon, TextField } from 'preact-mdl';

import onDomReady from './app/ready';
import LoginPage from './app/Login';
import Categories from './app/Categories';

function NotFound() { return (<p>Not found</p>); }
function Home() { return (<p>Home</p>); }

const categories = [{
  name: '18 +',
  description: 'Kinky shit for ya!',
}, {
  name: 'Food and drinks',
  description: 'Fancy some grub?',
}, {
  name: 'Culture',
  description: 'Like to learn stuff?',
}]

onDomReady(() => {
  history.replaceState(null,null,'/');

  const node = document.getElementById('app');

  console.log(node);
  render((
    <Layout fixed-header fixed-drawer>
      <Layout.Header>
        <Layout.HeaderRow>
          <Layout.Title>Miit</Layout.Title>
          <Layout.Spacer/>
        </Layout.HeaderRow>
      </Layout.Header>
      <Layout.Drawer>
        <Layout.Title>Miit</Layout.Title>
				<Navigation>
					<Navigation.Link href="/">Home</Navigation.Link>
					<Navigation.Link href="/login">Login</Navigation.Link>
          <Navigation.Link href="/categories">Categories</Navigation.Link>
				</Navigation>
			</Layout.Drawer>
      <Router>
        <Home path=""/>
        <LoginPage path="/login"/>
        <Categories path="/categories" categories={categories}/>
        <NotFound type="404" default/>
      </Router>
    </Layout>
  ), node);
});
