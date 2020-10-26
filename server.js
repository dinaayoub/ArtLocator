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

//global variables

//connect to db
client.connect();
client.on('error', error => handleErrors(error));

//handle application routes
app.get('/', showHomepage);
app.post('/searches', getArtworkResults)

//object constructors

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
  }
  catch (error) {
    handleErrors(error, res);
  }
}

function getSmithsonianResults(req, res) {
  //Testing the smithsonian api
  let artist = req.body.search;
  let url = `https://api.si.edu/openaccess/api/v1.0/category/art_design/search?q=${artist}&api_key=${process.env.SMITHSONIAN_APIKEY}`;
  
  //call the smithsonian's API
  superagent.get(url)
    .then(data => {
      //create an array of artworks and add all the smithsonian results to it
      var artworks = [];
      var rows = data.body.response.rows;
      rows.forEach(item => {
        console.log(item.content.freetext);
        artworks.push(new ArtWork(
          item.content.descriptiveNonRepeating.data_source,
          item.content.freetext.name[0].content,
          item.title,
          item.content.descriptiveNonRepeating.online_media ? (item.content.descriptiveNonRepeating.online_media.mediaCount > 0 ? item.content.descriptiveNonRepeating.online_media.media[0].thumbnail : null) : null,
          item.content.freetext.notes ? (item.content.freetext.notes[0].content ? item.content.freetext.notes[0].content : null) : null
        ));
      });
      res.render('pages/artworks', { artworks: artworks, query: artist });
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
