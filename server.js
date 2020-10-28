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
app.post('/searches', getArtworkResults);
app.get('/showArtworks/:id', showArtWork);

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
  let sql = `SELECT * FROM artists;`;
  client.query(sql)
    .then(artistsResult => {
      res.render('pages/index', { artists: artistsResult.rows });
    });
  //retrieve favorites here

  //then render the page
}

function showArtwork(req, res) {
  let sql = `SELECT * FROM artworks JOIN museums ON artworks.museum_id=museumS.id JOIN artists ON artworks.artist_id=artists.id WHERE artist_id=$1;`;
  client.query(sql)
    .then(artworksResults => {
      res.render('pages/savedArtist', { artworks: artworksResults.rows });
    });

}

function getArtworkResults(req, res) {
  //get the term the user searched for
  let artist = req.body.search;

  //------------------------------------------------------------------------------
  // Get the results for the search query from the smithsonian's api
  //------------------------------------------------------------------------------

  //set the url for smithsonian API
  let url = `https://api.si.edu/openaccess/api/v1.0/category/art_design/search?q=${artist}&api_key=${process.env.SMITHSONIAN_APIKEY}`;

  //call the smithsonian's API
  superagent.get(url)
    .then(smithsonianData => {
      //after every.tehn turn this into a function//
      //create an array of artworks that we will add all the smithsonian results to
      var allArtworks = [];
      //narrow down the results to those where the artist name matches the search query by using .filter on the returned array.
      //this API doesn't let you narrow the search to be by artist name only, so we have to do it manually here.
      var rows = smithsonianData.body.response.rows.length > 0 ? smithsonianData.body.response.rows.filter(item => item.content.freetext.name[0].content.toLowerCase().indexOf(artist.toLowerCase()) > -1) : [];

      //now iterate on the remaining rows and add the artworks to the array we created
      rows.forEach(item => {
        //check if the item's artist name matches the search query, because these APIs don't let you limit to artist name search only.
        allArtworks.push(new ArtWork(
          item.content.descriptiveNonRepeating.data_source,
          item.content.freetext.name[0].content,
          item.title,
          //if there is online_media, then check how many items are in it. If more than 0, then set the image URL to the thumbnail of the first image. Otherwise, set this field to null so we don't render an image on the page.
          item.content.descriptiveNonRepeating.online_media ? (item.content.descriptiveNonRepeating.online_media.mediaCount > 0 ? item.content.descriptiveNonRepeating.online_media.media[0].thumbnail : null) : null,
          //if there are notes describing the artwork, save the first note's content.  Otherwise, set this field to null so we don't display it on the page
          item.content.freetext.notes ? (item.content.freetext.notes[0].content ? item.content.freetext.notes[0].content : null) : null
        ));
      });
      //console.log('SMITHSONIAN ARTWORKS: ', allArtworks);
      return allArtworks;
    })
    //then, take the array of Artwork objects we created from the Smithsonian superagent call, and send it to get MET results
    .then(data => {
      var allArtworks = data;
      //get the results for the search query from the MET
      let url = `https://collectionapi.metmuseum.org/public/collection/v1/search?q=${artist}&artistOrCulture`;
      //call the MET's API which will return a list of object IDs that match the search query.
      //create a promises array to place all the gets we want based on the returned object IDs, then execute them all at once.
      var promises = [];
      superagent.get(url)
        .then(metData => {
          var rows = metData.body.objectIDs;
          //for each object ID we get back from the MET query, we now need to create another superagent call to get the details of that object
          rows.forEach(item => {
            //set the url for each item and push the superagent.get call into the promises array
            let eachObjectURL = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${item}`;
            promises.push(superagent.get(eachObjectURL));
          });
          //run the promises array so that we go ahead and call each of the saved superagent.get calls sequentially
          Promise.all(promises)
            .then(data => {
              //now we have "data" which is an aggregate of all the results from the superagent.get calls of each artwork

              //for each object in data, check whether its artist field matches the search query,
              //if it does, then create an object for it and add it to the artworks array.
              //if it doesn't, then just ignore that result.
              data.forEach(objectData => {
                if (objectData.body.artistDisplayName.toLowerCase().indexOf(artist.toLowerCase()) > -1) {
                  //console.log('THE MET API ARTIST NAME = ', objectData.body.artistDisplayName);
                  //the user's search query matches the artist's name, so create the object and push it into the allArtworks array.
                  allArtworks.push(new ArtWork(
                    objectData.body.repository,
                    objectData.body.artistDisplayName,
                    objectData.body.title,
                    objectData.body.primaryImage,
                    null
                  ));
                }
              });
              //we are done adding the MET results to the artworks array. Return it so that the next .then block can use it.
              return allArtworks;
            })
            .then(data => {
              //connect to the Artsy API using the header data they require
              let allArtworks = data;
              let url = `https://api.artsy.net/api/search?q=${artist}+more:pagemap:metatags-og_type:Artist`;
              //this will return the list of artists and "shows", whatever that means...
              superagent.get(url)
                //authentication with Artsy requires setting these headers. TODO: make the token something we get as well when it expires.
                .set('X-XAPP-Token', process.env.ARTSY_TOKEN)
                .set('Accept', 'application/vnd.artsy-v2+json')
                .then(data => {
                  //get the first result, and get the artist id from the "self" link by removing everything before the id (which is the last part of the href url)
                  var artistID = data.body._embedded.results[0]._links.self.href.slice(data.body._embedded.results[0]._links.self.href.indexOf('artists/') + 8, data.body._embedded.results[0]._links.self.href.length);
                  //get the artist full name so we can display it to the user.
                  var artistName = data.body._embedded.results[0].name;
                  //todo: we can improve this by getting all the artists and asking which one they mean, or just showing all the artworks by people of that name.
                  //Caveat: gotta figure out how to do a regular expression for a "word" (\b) with the dynamic artist name search query
                  //console.log('ARTIST ID = ', artistID);
                  let url = `https://api.artsy.net/api/artworks?artist_id=${artistID}`;
                  //now that we have the artist ID, get all that artist's artworks from Artsy (only returns 10 I believe)
                  superagent.get(url)
                    //set the headers again
                    .set('X-XAPP-Token', process.env.ARTSY_TOKEN)
                    .set('Accept', 'application/vnd.artsy-v2+json')
                    .then(data => {
                      //loop through the artworks returned and create an artwork object for each of them
                      data.body._embedded.artworks.forEach(artwork => {
                        allArtworks.push(new ArtWork(
                          artwork.collecting_institution, //this is the museum name
                          artistName, //the artist name we got from the previous API call
                          artwork.title, //the artwork title
                          artwork._links.thumbnail ? artwork._links.thumbnail.href.replace('medium', 'larger') : null, //the thumbnail, but to match all the others I'm getting the largest version of the image instead of the default medium one
                          null //they don't seem to have a description for artworks so set it to null :(
                        ));
                      })
                      return allArtworks;
                    })
                    .then(data => {
                      //now that we have the allArtworks array returned from the previous .then, render that array to the artworks page.
                      res.render('pages/artworks', { artworks: data, query: artist });
                      return data;
                    })
                    .then(data => {
                      let sql = `SELECT id FROM artists WHERE name=$1;`;
                      let values = [artist];
                      client.query(sql, values)
                        .then(result => {
                          console.log('id of artist', result.rows);
                          if (result.rows.length === 0) {
                            let addArtistsToTable = `INSERT INTO artists (name) VALUES ($1) RETURNING id;`;
                            let values = [artist];
                            client.query(addArtistsToTable, values)
                              .then(result => {
                                console.log('id inserted into artists table', result.rows[0]);
                                var artistsId = result.rows[0].id;
                                data.forEach(artwork => {
                                  let sql = `SELECT id FROM museums WHERE name=$1;`;
                                  let values = [artwork.museum];
                                  console.log(values);
                                  return client.query(sql, values)
                                    .then(result => {
                                      console.log('id of museum', result.rows);
                                      if (result.rows.length === 0) {
                                        let addMuseumsTable = `INSERT INTO museums (name) VALUES ($1) RETURNING id;`;
                                        let values = [artwork.museum];
                                        client.query(addMuseumsTable, values)
                                          .then(result => {
                                            console.log('id inserted into museums table', result.rows[0]);
                                            artwork.museumId = result.rows[0].id;
                                            let addToArtworksTable = `INSERT INTO artworks (title, description, image, artist_id, museum_id) VALUES ($1, $2, $3, $4, $5) RETURNING id;`;
                                            let values = [artwork.artworkTitle, artwork.artworkDescription, artwork.artworkImage, artistsId, artwork.museumId];
                                            console.log(values);
                                            client.query(addToArtworksTable, values)
                                              .then(result => {
                                                console.log(result.rows);
                                              });
                                          });
                                      } else {
                                        artwork.museumId = result.rows[0].id;
                                        let addToArtworksTable = `INSERT INTO artworks (title, description, image, artist_id, museum_id) VALUES ($1, $2, $3, $4, $5) RETURNING id;`;
                                        let values = [artwork.artworkTitle, artwork.artworkDescription, artwork.artworkImage, artistsId, artwork.museumId];
                                        client.query(addToArtworksTable, values)
                                          .then(result => {
                                            console.log(result.rows);
                                          });
                                      }
                                    }
                                    );
                                });
                              });
                          }
                        });
                    });
                });
            });
        });
    });
}

//check whether this artist is already in the database//

//if YES, do nothing, if NO, add to the artists table, get the ID back//
//INSERT INTO artwork//

//loop over data array, check if museum that is in the data array is in the database//

//if YES take museum ID and insert into artwork table the current object(from the data array taht we are looking at)//

//if NO add museum and get museum ID (INSERT INTO)//

//now I have the artist ID and the museum ID, and the object itself (at whatever index)//

//INSERT all INTO artwork table//

function handleErrors(error, res) {
  //render the error page with the provided error message.
  console.error('error message: ', error.message);
  if (res) {
    res.render('pages/error', { error: error });
  }
}

//catch all for unknown routes
//app.get('*', handleErrors);

//start up the server
app.listen(PORT, () => {
  console.log(`Server is up on port `, PORT);
});
