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

// app.get('/movies', getMovie);

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
      RETURNING id
      ;`;
  let values = Object.values(this);
  return client.query(SQL,values)
    .then(result =>
    { this.id = result.rows[0].id;
      return this;
    })
}

Location.fetchLocation = (query) => {
  const URL = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GOOGLE_MAPS_API}`;
  return superagent.get(URL)
    .then( data => {
      console.log('Retrieving data from API');
      if( ! data.body.results.length){ throw 'No Data Received';}
      else{
        let location = new Location(query, data.body.results[0]);
        return location.save();
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
        .then(data => {
          response.send(data)});
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

DailyWeather.prototype.save = function(id) {
  const SQL = `INSERT INTO weathers (forecast, time, location_id, created_at) VALUES ($1, $2, $3, $4);`;
  const values = Object.values(this);
  values.push(id);
  values.push(Date.now());
  client.query(SQL, values);
}

DailyWeather.deleteEntryById = function (id) {
  const SQL = `DELETE FROM weathers WHERE location_id=${id};`;
  client.query(SQL)
    .then(() => {
      console.log('DELETED entry from SQL');
    })
    .catch(error => handleError(error));
}

DailyWeather.lookup = function(handler) {
  const SQL = `SELECT * FROM weathers WHERE location_id=$1;`;
  client.query(SQL, [handler.location.id])
    .then(result => {
      if(result.rowCount > 0) {
        console.log('Data existed in SQL');

        let currentAge = Date.now() - result.rows[0].created_at / (1000 * 60);

        if (result.rowCount > 0 && currentAge > 60) {
          console.log('DATA was too old')
          DailyWeather.deleteEntryById(handler.location.id)
          handler.cacheMiss();
        } else {
          console.log('DATA was just right')
          handler.cacheHit(result);
        }
      } else {
        console.log('Got data from API');
        handler.cacheMiss();
      }
    })
    .catch(error => handleError(error));
};

DailyWeather.fetch = function(location) {
  const url = `https://api.darksky.net/forecast/${process.env.DARK_SKY_API}/${location.latitude},${location.longitude}`;

  return superagent.get(url)
    .then(result => {
      const weatherSummaries = result.body.daily.data.map(day => {
        const summary = new DailyWeather(day);
        summary.save(location.id);
        return summary;
      });
      return weatherSummaries;
    });
};


function getWeather(request, response){
  const handler = {

    location: request.query.data,

    cacheHit: function(result) {
      response.send(result.rows);
    },

    cacheMiss: function() {
      DailyWeather.fetch(request.query.data)
        .then( results => response.send(results) )
        .catch( console.error );
    },
  };

  DailyWeather.lookup(handler);

}

// /*---------------------YELP--------------------------*/
function YelpRestaurants(data){
  this.name = data.name;
  this.image_url = data.image_url;
  this.price = data.price;
  this.rating = data.rating;
  this.url = data.url;
}

YelpRestaurants.prototype.save = function(id) {
  const SQL = `INSERT INTO yelps (name, image_url, price, rating, url, location_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`
  const values = Object.values(this);
  values.push(id);
  values.push(Date.now());
  client.query(SQL, values);
}

YelpRestaurants.deleteEntryById = function(id) {
  const SQL = `DELETE FROM yelps WHERE location_id=${id};`;
  client.query(SQL)
    .then(() => {
      console.log('DELETED entry from SQL');
    })
    .catch(error => handleError(error))
}

YelpRestaurants.lookup = function(handler) {
  const SQL = `SELECT * FROM yelps WHERE location_id=$1;`;
  client.query(SQL, [handler.location.id])
    .then(result => {
      if(result.rowCount > 0) {
        console.log('Data existed in SQL');

        let currentAge = Date.now() - result.rows[0].created_at / (1000 * 60 * 60);

        if (result.rowCount > 0 && currentAge > 23) {
          console.log('DATA was too old')
          YelpRestaurants.deleteEntryById(handler.location.id)
          handler.cacheMiss();
        } else {
          console.log('DATA was just right')
          handler.cacheHit(result);
        }

      } else {
        console.log('Got data from API');
        handler.cacheMiss();
      }
    })
    .catch(error => handleError(error));
};

YelpRestaurants.fetch = function(location) {
  const URL = `https://api.yelp.com/v3/businesses/search?term=restaurants&latitude=${location.latitude}&longitude=${location.longitude}`;

  return superagent.get(URL)
    .set('Authorization', `Bearer ${process.env.YELP_API}`)
    .then(results =>{
      const yelpSummaries = results.body.businesses.map(restaurants => {
        const summary = new YelpRestaurants(restaurants);
        summary.save(location.id);
        return summary;
      });
      return yelpSummaries;
    });
};




function getYelp(request, response){

  const handler = {
    location: request.query.data,

    cacheHit: function(result) {
      response.send(result.rows);
    },

    cacheMiss: function() {
      YelpRestaurants.fetch(request.query.data)
        .then ( results => response.send(results))
        .catch(console.error);
    },
  };
  YelpRestaurants.lookup(handler)
}
// /*---------------------MOVIES--------------------------*/
// function getMovie(request, response){
//   let cityname = request.query.data.formatted_query.split(',')[0];
//   const URL = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIES_API}&language=en-US&query=${cityname}&page=1`
//   return superagent.get(URL)
//     .then(movie =>{
//       response.send(movie.body.results.map((results)=>{
//         return new Movie(results);
//       }));
//     })
//     .catch(error => handleError(error, response));
// }




// function Movie(data){
//   this.title = data.title;
//   this.overview = data.overview;
//   this.average_vote = data.vote_average;
//   this.total_votes = data.vote_count;
//   this.image_url = `https://image.tmdb.org/t/p/original/${data.poster_path}`;
//   this.popularity = data.popularity;
//   this.released_on = data.release_date;
// }

app.listen(PORT, () => console.log(`App is up on ${PORT}`) );
