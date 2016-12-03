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
  color: 'hsla(341, 100%, 40%, 1)',
  people: 24,
}, {
  name: 'Food and drinks',
  description: 'Fancy some grub?',
  color: 'hsla(341, 100%, 40%, 1)'
}, {
  name: 'Culture',
  description: 'Like to learn stuff?',
  color: 'hsla(341, 100%, 40%, 1)'
}, {
  name: 'Outdoors & Sports',
  description: 'GTFO!',
  color: 'hsla(341, 100%, 40%, 1)'
}]

onDomReady(() => {

  const node = document.getElementById('app');

  console.log(node);
  render((
    <Layout fixed-header fixed-drawer>
      <Layout.Header style={{
                backgroundColor: '#747676'}}>
        <Layout.HeaderRow style={{
                backgroundColor: '#747676'}}>
          <Layout.Title>  
            <img src="/static/img/miitnow_txt.png" alt="miitnow" style="height:20px;"></img>
          </Layout.Title>
          <Layout.Spacer/>
        </Layout.HeaderRow>
      </Layout.Header>
      <Layout.Drawer>
        <Layout.Title><img src="/static/img/miitnow_txt.png" alt="miitnow" style="height:20px;"></img></Layout.Title>
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
