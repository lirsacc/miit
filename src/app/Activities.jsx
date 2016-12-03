import { h, Component } from 'preact';
import { withGoogleMap, GoogleMap, Marker } from "react-google-maps";

// Wrap all `react-google-maps` components with `withGoogleMap` HOC
// and name it GettingStartedGoogleMap
const ActivitiesMap = withGoogleMap(props => (
  <GoogleMap
    ref={props.onMapLoad}
    defaultZoom={10}
    defaultCenter={{ lat: 48.1507279, lng: 11.5472608 }}
    onClick={props.onMapClick}
  >
    {props.markers.map((marker, index) => (
      <Marker
        {...marker}
        onRightClick={() => props.onMarkerRightClick(index)}
      />
    ))}
  </GoogleMap>
));

export default class Activities extends Component {


  constructor(props) {
    super(props);
    this.state = {
      markers: [],
    };
    this.getLocation();
  }

  getLocation() {
      if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(this.updatePosition);
      }
  }

  handleMarkerRightClick = (targetMarker) => {
    const nextMarkers = this.state.markers.filter(marker => marker !== targetMarker);
    this.setState({
      markers: nextMarkers,
    });
  }

  updatePosition = (position) => {
    this.state.markers.push({
      position: {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      },
      key: `Your are here`,
      defaultAnimation: 2,
    })
    this.setState(this.state)
  }

  handleMapLoad = (map) => {
    this._mapComponent = map;
    if (map) {
      console.log(map);
    }
  }

  render() {
    return(
      <div id="activitesMap" style={{height: '100%'}}>
        <ActivitiesMap
          containerElement={
            <div style={{ height: '100%', width: '100%' }} />
          }
          mapElement={
            <div style={{ height: '100%', width: '100%' }} />
          }
          onMapLoad={this.handleMapLoad}
          onMapClick={() => {}}
          markers={this.state.markers}
          onMarkerRightClick={() => {}}
        />
      </div>
    );
  }
}
