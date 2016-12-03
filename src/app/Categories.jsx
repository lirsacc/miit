import { h, render, Component} from 'preact';
import { Card, Button, Icon, Layout, TextField } from 'preact-mdl';

export default class Categories extends Component {
  constructor(props) {
    super(props);
    this.state = {
      currentCategory: 0,
      selectedCategories: props.categories.reduce(
        (obj, cat) => ({...obj, [cat.name]: undefined}), {}
      ),
    }
  }

  selectCategory = (name, val) => {
    this.setState({selectedCategories: Object.assign(this.state.selectedCategories, {[name]:val})}) 
  }

  render(props) {
    const availableCategories = this.props.categories.filter((cat) => !this.state.selectedCategories[cat]);
    const nextCat = availableCategories[0];
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
          {this.props.categories.filter((cat) => this.state.selectedCategories[cat.name] == undefined).map((category) =>
            <Card key={category.name} shadow="2dp" class="my1 border-box" border style={{
              minHeight: 0,
              width: '100%',
            }}>
              <Card.Title style={{
                backgroundColor: category.color || 'hsla(235, 54%, 42%, 1.0)',
                color: 'white', width:'100%', display: 'inline-block'
              }}>
                <Card.TitleText><b>{category.name}</b></Card.TitleText>
                <Card.Description><h9>{category.description}</h9></Card.Description>
                <Card.Actions border class="right-align">
                  <Button onClick={()=>this.selectCategory(category.name, true)}><img src="/static/img/thumbs_up.png" alt="miitnow" style="height:30px;"></img></Button>
                  <Button onClick={()=>this.selectCategory(category.name, false)}><img src="/static/img/thumbs_dwn.png" alt="miitnow" style="height:30px;"></img></Button>
                </Card.Actions>
              </Card.Title>
            </Card>
          )}
          <Button style={{float: 'right'}}>Next</Button>
        </div>
        <div>
        </div>
      </section>
    );
  }
}
