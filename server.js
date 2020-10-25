'use strict';

//dependencies
const express = require('express');
const app = express();
const superagent = require('superagent');
const env = require('dotenv');
const pg = require('pg');
const cors = require('cors');
const methodOverride = require('method-override');

//client side configs
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('./public'));
app.use(methodOverride('_method'));
app.set('view engine', 'ejs');


//server side configs
env.config();
const PORT = process.env.PORT || 3300;
const client = new pg.Client(process.env.DATABASE_URL);

//connect to db
client.connect();
client.on('error', error => handleErrors(error));

//handle application routes
app.get('/', showHomepage);
app.post('/searches', getArtworkResults)
//object constructors
var artworks = [];

function ArtWork(museum, artistName, artworkTitle, artworkImage, artworkDescription) {
  this.museum = museum;
  this.artistName = artistName;
  this.artworkImage = artworkImage;
  this.artworkDescription = artworkDescription;
  this.artworkTitle = artworkTitle;
}

//functions
function showHomepage(req, res) {
  res.render('pages/index');
}

function getArtworkResults(req, res) {
  try {
    //call all the APIs
    getSmithsonianResults(req, res);
    res.render('pages/artworks', { artworks: artworks });
    //artworks = [];
  }
  catch (error) {
    handleErrors(error, res);
  }
}

function getSmithsonianResults(req, res) {
  //Testing the smithsonian api
  let artist = req.body.search;
  console.log('ARTIST NAME = ', artist);
  let url = `https://api.si.edu/openaccess/api/v1.0/category/art_design/search?q=${artist}&api_key=${process.env.SMITHSONIAN_APIKEY}`;
  superagent.get(url)
    .then(data => {
      var rows = data.body.response.rows;
      rows.forEach(item => {
        artworks.push(new ArtWork(
          item.content.descriptiveNonRepeating.data_source,
          artist,
          item.title,
          item.content.descriptiveNonRepeating.online_media ? item.content.descriptiveNonRepeating.online_media.media[0].thumbnail : null,
          item.content.freetext.notes[0].content));
        console.log(artworks);
      });
    })
    .catch(error => handleErrors(error, res));
}


function handleErrors(error, res) {
  console.error(error.message);
  if (res) {
    res.render('pages/error', { error: error });
  }
}

//catch all for unknown routes
app.get('*', handleErrors);

//start up the server
app.listen(PORT, () => {
  console.log(`Server is up on port `, PORT);
});
