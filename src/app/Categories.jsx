import { h, render, Component} from 'preact';
import { Card, Button, Icon, Layout, TextField } from 'preact-mdl';

export default class Categories extends Component {
  constructor(props) {
    super(props);
    this.state = {
      currentCategory: 0,
      selectedCategories: props.categories.reduce(
        (obj, cat) => ({...obj, [cat.name]: undefined})
      ),
    }
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
          {this.props.categories.filter((cat) => !this.state.selectedCategories[cat]).map((category) =>
            <Card shadow="2dp" class="my1 border-box" border style={{
              minHeight: 0,
              width: '100%',
            }}>
              <Card.Title style={{
                backgroundColor: category.color || 'hsla(235, 54%, 42%, 1.0)',
                color: 'white',
              }}>
                <Card.TitleText>{category.name}</Card.TitleText>
              </Card.Title>
              <Card.Text>
                {category.description}
              </Card.Text>
              <Card.Actions border class="right-align">
                <Button>Sounds cool!</Button>
                <Button>Nah</Button>
              </Card.Actions>
            </Card>
          )}
        </div>
        <div>

        </div>
      </section>
    );
  }
}
