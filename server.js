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
var allArtworks = [];
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
    //todo: need to figure out how to wait for all of the superagent.get calls
    //before rendering to the page. 
    allArtworks = [];
    let artist = req.body.search;
    getSmithsonianResults(req, res);
    getMETResults(req, res);
    res.render('pages/artworks', { artworks: allArtworks, query: artist });
    console.log(allArtworks);
  }
  catch (error) {
    handleErrors(error, res);
  }
}

function getSmithsonianResults(req, res) {
  //get the results for the search query from the smithsonian's api
  let artist = req.body.search;
  let url = `https://api.si.edu/openaccess/api/v1.0/category/art_design/search?q=${artist}&api_key=${process.env.SMITHSONIAN_APIKEY}`;

  //call the smithsonian's API
  superagent.get(url)
    .then(data => {
      //create an array of artworks and add all the smithsonian results to it
      var rows = data.body.response.rows.length > 0 ? data.body.response.rows.filter(item => item.content.freetext.name[0].content.toLowerCase().indexOf(artist.toLowerCase()) > -1) : [];
      rows.forEach(item => {
        if (item.content.freetext.name[0].content.toLowerCase().indexOf(artist.toLowerCase()) > -1) {

          allArtworks.push(new ArtWork(
            item.content.descriptiveNonRepeating.data_source,
            item.content.freetext.name[0].content,
            item.title,
            item.content.descriptiveNonRepeating.online_media ? (item.content.descriptiveNonRepeating.online_media.mediaCount > 0 ? item.content.descriptiveNonRepeating.online_media.media[0].thumbnail : null) : null,
            item.content.freetext.notes ? (item.content.freetext.notes[0].content ? item.content.freetext.notes[0].content : null) : null
          ));

        }
      });

      //todo: remove this and replace it with return artworks so that we can aggregate artworks from multiple sources. 
      //res.render('pages/artworks', { artworks: allArtworks, query: artist });
    })
    .catch(error => handleErrors(error, res));
}

function getMETResults(req, res) {
  //get the results for the search query from the MET
  let artist = req.body.search;
  let url = `https://collectionapi.metmuseum.org/public/collection/v1/search?q=${artist}&medium=Paintings&artistOrCulture`;

  //call the MET's API
  superagent.get(url)
    .then(data => {
      var rows = data.body.objectIDs;
      //rows.length = 10; //limiting the results to 10
      rows.forEach(item => {
        //get the data for each item
        let eachObjectURL = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${item}`;
        superagent.get(eachObjectURL)
          .then(objectData => {
            if (objectData.body.artistDisplayName.toLowerCase().indexOf(artist.toLowerCase()) > -1) {
              allArtworks.push(new ArtWork(
                objectData.body.repository,
                objectData.body.artistDisplayName,
                objectData.body.title,
                objectData.body.primaryImage,
                ''
              ));
            }
          })
          .catch(error => handleErrors(error, res));

      });
    })
    .catch(error => handleErrors(error, res));
  //return artworks;
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
