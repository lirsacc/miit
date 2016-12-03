import { h, Component } from 'preact';
import { Button, Card, CardTitle, CardAction, CardText } from 'preact-mdl';
import { withGoogleMap, GoogleMap, InfoWindow, Marker } from "react-google-maps";


const ActivitiesMap = withGoogleMap(props => {
  const categories = props.appState.categories;
  console.log(categories);
  return (
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
                <CardTitle style={{
                  color: categories[marker.category].color,
                }}>
                <img
                  style={{
                    height: '32px',
                    width: '32px',
                    borderRadius: '100%',
                  }}
                  src="http://static1.businessinsider.com/image/5550bf6569bedd163302b68d-960/tesla-elon-musk.jpg"
                /> <span class="ml1">{marker.infoContent}</span>
                </CardTitle>
                <CardText>
                  Participants: {marker.confirmedParticipants} / {marker.participants}
                  <br/>
                  When: {marker.time.toString()}
                </CardText>
                <CardAction>
                  { !marker.registered ?
                    <Button colored raised onClick={() => props.registerForEvent(index)}>
                      I am interested
                    </Button>
                  :
                    <Button disabled color raised>
                      Waiting for approval
                    </Button>
                  }
                  <div class="mdl-layout-spacer"></div>
                </CardAction>
              </Card>
            </InfoWindow>
        )}
        </Marker>
      ))}
    </GoogleMap>
  );
});

export default class Activities extends Component {
  constructor(props) {
    super(props);
    console.log(props);
    this.state.selectedEvent = null;
    this.state.markers = [
      {
        position: {
          lat: 48.127737,
          lng: 11.609621
        },
        registered: false,
        category: 'Outdoors & Sports',
        infoContent: "Bouldering @ Boulderwelt",
        participants: 5,
        confirmedParticipants: 3,
        time: new Date(2016, 12, 3, 19, 0)
      },
      {
        position: {
          lat: 48.150404,
          lng: 11.584790
        },
        infoContent: "Coktail Night @ Königin",
        category: 'Food and drinks',
        registered: false,
        participants: 3,
        confirmedParticipants: 1,
        time: new Date(2016, 12, 4, 21, 0)
      },
    ]
  }

  registerForEvent = (index) => {
    const markers = this.state.markers;
    let event = markers[index];
    event = {...event, registered: true};
    this.setState({
      markers: [...markers.slice(0, index), event, ...markers.slice(index + 1)]
    });
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
      <div id="activitesMap" class="flex flex-auto flex-column justify-start" style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}>
        <ActivitiesMap
          containerElement={<div class="flex flex-auto"/>}
          mapElement={<div class="flex flex-auto"/>}
          registerForEvent={this.registerForEvent}
          appState={this.props.appState}
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
