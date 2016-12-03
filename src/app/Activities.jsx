import { h, Component } from 'preact';
import { Button, Card, CardTitle, CardAction, CardText } from 'preact-mdl';
import { withGoogleMap, GoogleMap, InfoWindow, Marker } from "react-google-maps";


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
        onClick={() => props.onMarkerClick(marker)}
      >
      {marker.showInfo && (
          <InfoWindow onCloseClick={() => props.onMarkerClose(marker)}>
            <Card>
              <CardTitle>
                {marker.key}
              </CardTitle>
              <CardText>
                Participants: {marker.participants}
              </CardText>
              <CardText>
                Time: {marker.time.toDateString()}
              </CardText>
              <CardAction>
                <Button onClick={() => props.showEvent(marker)}>
                  Show me!
                </Button>
                <div class="mdl-layout-spacer"></div>
              </CardAction>
            </Card>
          </InfoWindow>
      )}
      </Marker>
    ))}
  </GoogleMap>
));

export default class Activities extends Component {
  constructor(props) {
    super(props);
    this.state.selectedEvent = null;
    this.state.markers = [
      {
        position: {
          lat: 48.127737,
          lng: 11.609621
        },
        key: 'Outdoors & Sports',
        infoContent: "Hello World",
        participants: 5,
        time: new Date(2016, 12, 3, 19, 0)
      },
      {
        position: {
          lat: 48.150404,
          lng: 11.584790
        },
        infoContent: "Hello World",
        key: 'Food and drinks',
        participants: 3,
        time: new Date(2016, 12, 4, 21, 0)
      },
    ]
    // this.getLocation();
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
      showInfo: false,
      key: `Your are here`,
      defaultAnimation: 2,
    });
    this.setState(this.state);
  }

  handleMapLoad = (map) => {
    this._mapComponent = map;
    if (map) {
      console.log(map);
    }
  }

  onMarkerClick = (marker) => {
    this.setState({
      markers: this.state.markers.map((m) => {
        if (m === marker) {
          m.showInfo = true;
        }
        else {
          m.showInfo = false;
        }
        return m;
      })
    });
  }

  onMarkerClose = (marker) => {
    this.setState({
      markers: this.state.markers.map((m) => {
        m.showInfo = false;
        return m;
      })
    });
  }

  showEvent = (marker) => {
    // TODO: Show event detail page
    this.onMarkerClose(marker);
  }

  render(props) {
    return (
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
          onMarkerClick={this.onMarkerClick}
          onMarkerClose={this.onMarkerClose}
          join={this.join}
        />
      </div>

    );
  }
}
