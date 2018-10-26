'use strict'

const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');

require('dotenv').config();

const PORT = process.env.PORT || 3000;

const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('err', err => console.log(err));

const app = express();

app.use(cors());

app.get('/location', getLocation);

app.get('/weather', getWeather);

app.get('/yelp', getYelp);

app.get('/movies', getMovie);

function handleError(err, res){
  console.error('ERR', err);
  if (res) res.status(500).send('Oh NOOO!!!!  We\'re so sorry.  We really tried.');
}
/*---------------------LOCATION--------------------------*/
function Location(query, data){
  this.search_query = query;
  this.formatted_query = data.formatted_address;
  this.latitude = data.geometry.location.lat;
  this.longitude = data.geometry.location.lng;
}
Location.prototype.save = function(){
  let SQL = `
    INSERT INTO locations
      (search_query,formatted_query,latitude,longitude)
      VALUES($1,$2,$3,$4)
  `;
  let values = Object.values(this);
  client.query(SQL,values);
}

Location.fetchLocation = (query) => {
  const URL = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GOOGLE_MAPS_API}`;
  return superagent.get(URL)
    .then( data => {
      console.log('Retrieving data from API');
      if( ! data.body.results.length){ throw 'No Data Received';}
      else{
        let location = new Location(query, data.body.results[0]);
        location.save();
        return location;
      }
    });
};

function getLocation(request, response){
  const locationHandler = {

    query: request.query.data,

    cacheHit: (results) => {
      console.log('Got data from SQL');
      response.send(results.rows[0]);
    },

    cacheMiss: () => {
      Location.fetchLocation(request.query.data)
        .then(data => response.send(data));
    },
  };

  Location.lookupLocation(locationHandler);
}

Location.lookupLocation = (handler) => {

  const SQL = `SELECT * FROM locations where search_query=$1`;
  const values = [handler.query];

  return client.query( SQL, values)
    .then( results => {
      if(results.rowCount > 0){
        handler.cacheHit(results);
      }
      else{
        handler.cacheMiss();
      }
    })
    .catch( console.error );
}

/*---------------------WEATHER--------------------------*/

function DailyWeather(data){
  this.forecast = data.summary;
  this.time = new Date(data.time * 1000).toString().slice(0,15);
}

function getWeather(request, response){
  const URL = `https://api.darksky.net/forecast/${process.env.DARK_SKY_API}/${request.query.data.latitude},${request.query.data.longitude}`;
  return superagent.get(URL)
    .then(forecastResults =>{
      response.send(forecastResults.body.daily.data.map((day)=>{
        return new DailyWeather(day);
      }));
    })
    .catch(error => handleError(error, response));
}
/*---------------------YELP--------------------------*/
function getYelp(request, response){
  const URL = `https://api.yelp.com/v3/businesses/search?term=restaurants&latitude=${request.query.data.latitude}&longitude=${request.query.data.longitude}`;
  return superagent.get(URL)
    .set('Authorization', `Bearer ${process.env.YELP_API}`)
    .then(yelpResults =>{
      response.send(yelpResults.body.businesses.map((restaurants)=>{
        return new YelpRestaurants(restaurants);
      }));
    })
    .catch(error => handleError(error, response));
}
/*---------------------MOVIES--------------------------*/
function getMovie(request, response){
  let cityname = request.query.data.formatted_query.split(',')[0];
  const URL = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIES_API}&language=en-US&query=${cityname}&page=1`
  return superagent.get(URL)
    .then(movie =>{
      response.send(movie.body.results.map((results)=>{
        return new Movie(results);
      }));
    })
    .catch(error => handleError(error, response));
}


function YelpRestaurants(data){
  this.name = data.name;
  this.image_url = data.image_url;
  this.price = data.price;
  this.rating = data.rating;
  this.url = data.url;
}

function Movie(data){
  this.title = data.title;
  this.overview = data.overview;
  this.average_vote = data.vote_average;
  this.total_votes = data.vote_count;
  this.image_url = `https://image.tmdb.org/t/p/original/${data.poster_path}`;
  this.popularity = data.popularity;
  this.released_on = data.release_date;
}

app.listen(PORT, () => console.log(`App is up on ${PORT}`) );