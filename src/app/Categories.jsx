import { h, render, Component} from 'preact';
import { Card, Button, Icon, TextField } from 'preact-mdl';

export default class Categories extends Component {
  constructor(props) {
    super(props);
    this.state = {
      selectedCategories: props.categories.reduce(
        (obj, key) => ({...obj, [key]: false})),
    }
  }

  render(props) {
    return (
      <section className="appView flex flex-column justify-between">
        {this.props.categories.map((category) =>
          <Card></Card>
        )}
      </section>
    );
  }
}
