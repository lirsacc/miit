import { h, render, Component} from 'preact';
import { Card, Button, Icon, Layout, TextField } from 'preact-mdl';

export default class Categories extends Component {

  selectCategory = (name, val) => {
    this.props.update({
      categorySelection: {
        ...this.props.appState.categorySelection,
        [name]: val,
      }
    })
  }

  done = () => this.props.goTo('/');

  render(props) {
    const categories = this.props.appState.categories;
    const selection = this.props.appState.categorySelection;

    console.log(this.props.appState);

    const availableCategories = Object.keys(categories).filter((cat) => selection[cat] === undefined);

    return (
      <section class="appView p1">
        {
          availableCategories.length > 0 ? (
            <div>
              <p class="border-box p1">What are your interests ?</p>

            </div>
          ) : (
            <div>
              <p>
                No more categories to chose from.
                You can always change this later in your profile.
              </p>
            </div>
          )
        }
        <div>
          {availableCategories.map((cat) => {
            const category = categories[cat];
            return (
              <Card key={category.name} shadow="2dp" class="my2 border-box" border style={{
                minHeight: 0,
                width: '100%',
              }}>
                <Card.Title style={{
                  backgroundColor: category.color || 'hsla(235, 54%, 42%, 1.0)',
                  color: 'white', width:'100%', display: 'inline-block'
                }}>
                  <Card.TitleText>{category.name}</Card.TitleText>
                  <Card.Description>
                    <small>
                      {category.description}
                      <br/>
                      {category.peopleNearby} people nearby.
                    </small>
                  </Card.Description>
                  <Card.Actions border class="right-align">
                    <Button onClick={()=>this.selectCategory(category.name, true)}><img src="/static/img/thumbs_up.png" alt="miitnow" style="height:30px;"></img></Button>
                    <Button onClick={()=>this.selectCategory(category.name, false)}><img src="/static/img/thumbs_dwn.png" alt="miitnow" style="height:30px;"></img></Button>
                  </Card.Actions>
                </Card.Title>
              </Card>
            );
          })}
          <Button style={{float: 'right'}} onClick={() => this.props.goTo('/events')}>Next</Button>
        </div>
        <div>
        </div>
      </section>
    );
  }
}
