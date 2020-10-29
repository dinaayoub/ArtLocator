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
client.on('error', error => console.log('DATABASE ERROR: ', error));

//handle application routes
app.get('/', showHomepage);
app.post('/searches', getArtworkResults);
app.get('/showArtworks/:name', showArtwork);
app.post('/delete/:artistName', deleteArtists)

//object constructors
function ArtWork(museum, artistName, artworkTitle, artworkImage, artworkDescription, city) {
  this.museum = museum;
  this.artistName = artistName;
  this.artworkImage = artworkImage;
  this.artworkDescription = artworkDescription;
  this.artworkTitle = artworkTitle;
  this.city = city;
}

//functions
function showHomepage(req, res) {
  //retrieve favorites here
  let sql = `SELECT DISTINCT artist FROM artworks;`;
  client.query(sql)
    .then(artistsResult => {
      let sql2 = `SELECT city, COUNT(*) AS totalartworks FROM artworks GROUP BY city ORDER BY totalartworks DESC`;
      client.query(sql2)
        .then(results => {
          //then render the page
          res.render('pages/index', { cities: results.rows, artists: artistsResult.rows });
        })
        .catch(error => handleErrors(error, res));
    });
}

function showArtwork(req, res) {
  let sql = `SELECT * FROM artworks WHERE artist=$1;`;
  let values = [req.params.name];
  client.query(sql, values)
    .then(artworksResults => {
      res.render('pages/savedArtist', { artworks: artworksResults.rows });
    })
    .catch(error => handleErrors(error, res));
}

function deleteArtists(request, response) {
  let artistName = request.params.artistName;
  const SQL = 'DELETE FROM artworks WHERE artist=$1;'
  const VALUES = [artistName];
  client.query(SQL, VALUES)
    .then(() => {
      response.status(200).redirect('/');
    })
    .catch(error => {
      console.error(error.message);
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
      var rows = [];
      if (smithsonianData.body.response.rows.length > 0) {
        rows = smithsonianData.body.response.rows.filter(item => {
          if (item.content.freetext.name && item.content.freetext.name.length > 0) {
            return item.content.freetext.name[0].content.toLowerCase().indexOf(artist.toLowerCase()) > -1;
          }
        });
      }
      //now iterate on the remaining rows and add the artworks to the array we created
      rows.forEach(item => {
        allArtworks.push(new ArtWork(
          item.content.descriptiveNonRepeating.data_source,
          artist,
          item.title,
          //if there is online_media, then check how many items are in it. If more than 0, then set the image URL to the thumbnail of the first image. Otherwise, set this field to null so we don't render an image on the page.
          (item.content.descriptiveNonRepeating.online_media && item.content.descriptiveNonRepeating.online_media.mediaCount > 0) ? item.content.descriptiveNonRepeating.online_media.media[0].thumbnail : null,
          //if there are notes describing the artwork, save the first note's content.  Otherwise, set this field to null so we don't display it on the page
          (item.content.freetext.notes && item.content.freetext.notes.length) > 0 ? (item.content.freetext.notes[0].content ? item.content.freetext.notes[0].content : null) : null,
          'Washington D.C.'
        ));
      });
      return allArtworks;

    })
    //------------------------------------------------------------------------------
    // Get the results for the search query from the MET's api
    //------------------------------------------------------------------------------
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
          var rows = metData.body.objectIDs ? metData.body.objectIDs : [];
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
                  //the user's search query matches the artist's name, so create the object and push it into the allArtworks array.
                  allArtworks.push(new ArtWork(
                    objectData.body.repository,
                    artist,
                    objectData.body.title,
                    objectData.body.primaryImage,
                    null,
                    'New York NY'
                  ));
                }
              });
              //we are done adding the MET results to the artworks array. Return it so that the next .then block can use it.
              return allArtworks;
            })
            //------------------------------------------------------------------------------
            // Get the results for the search query from the Arty api
            //------------------------------------------------------------------------------
            .then(data => {
              //connect to the Artsy API using the header data they require
              let allArtworks = data;
              let url = `https://api.artsy.net/api/search?q=${artist}+more:pagemap:metatags-og_type:artist`;
              //this will return the list of artists and "shows", whatever that means...
              superagent.get(url)
                //authentication with Artsy requires setting these headers. TODO: make the token something we get as well when it expires.
                .set('X-XAPP-Token', process.env.ARTSY_TOKEN)
                .set('Accept', 'application/vnd.artsy-v2+json')
                .then(data => {
                  //get the first "artist" result, and get the artist id from the "self" link by removing everything before the id (which is the last part of the href url)
                  var artistID;
                  for (let i = 0; i < data.body._embedded.results.length; i++) {
                    //if the current result's type is artist and it has a self link, then get the artist ID from it.
                    if (data.body._embedded.results[i].og_type === 'artist' && data.body._embedded.results[i]._links.self.href) {
                      //slice the link to get the ID of the artist which comes after "artists/" in the URL
                      artistID = data.body._embedded.results[i]._links.self.href.slice(data.body._embedded.results[i]._links.self.href.indexOf('artists/') + 8, data.body._embedded.results[i]._links.self.href.length);
                      //quit the for loop because we're just choosing the first artist.
                      //todo: we can improve this by getting all the artists and asking which one they mean, or just showing all the artworks by people of that name.
                      break;
                    }
                  }

                  let url = `https://api.artsy.net/api/artworks?artist_id=${artistID}`;
                  //now that we have the artist ID, get all that artist's artworks from Artsy (only returns 10 I believe)
                  superagent.get(url)
                    //set the headers again
                    .set('X-XAPP-Token', process.env.ARTSY_TOKEN)
                    .set('Accept', 'application/vnd.artsy-v2+json')
                    .then(data => {
                      //loop through the artworks returned and create an artwork object for each of them
                      data.body._embedded.artworks.forEach(artwork => {
                        //find the city name if it is provided in the collecting institution field
                        let city = '';
                        if (artwork.collecting_institution && artwork.collecting_institution.indexOf(', ') > -1) {
                          city = artwork.collecting_institution.slice(artwork.collecting_institution.indexOf(', ') + 2, artwork.collecting_institution.length);
                        }
                        allArtworks.push(new ArtWork(
                          artwork.collecting_institution, //this is the museum name
                          artist, //the artist name we got from the previous API call
                          artwork.title, //the artwork title
                          artwork._links.thumbnail ? artwork._links.thumbnail.href.replace('medium', 'larger') : null, //the thumbnail, but to match all the others I'm getting the largest version of the image instead of the default medium one
                          null, //they don't seem to have a description for artworks so set it to null :(,
                          city
                        ));
                      })
                      return allArtworks;
                    })
                    //------------------------------------------------------------------------------
                    // Get the results for the search query from the Harvard api
                    //------------------------------------------------------------------------------
                    .then(allArtworks => {
                      let url = `https://api.harvardartmuseums.org/person?q="${artist}"&apikey=${process.env.HARVARD_APIKEY}&sort=objectcount&sortorder=desc&`
                      var artistID;
                      superagent.get(url)
                        .then(people => {
                          if (people.body.records && people.body.records.length > 0) {
                            artistID = people.body.records[0].id;
                          }
                          return allArtworks;
                        })
                        .then(allArtworks => {
                          let url = `https://api.harvardartmuseums.org/object?apikey=${process.env.HARVARD_APIKEY}&person=${artistID}&classification=Paintings`;
                          superagent.get(url)
                            .then(data => {
                              if (data.body.records) {
                                data.body.records.forEach(artwork => {
                                  allArtworks.push(new ArtWork(
                                    artwork.creditline,
                                    artist,
                                    artwork.title,
                                    artwork.primaryimageurl,
                                    artwork.labeltext,
                                    'Boston, MA'
                                  ))
                                })
                              }
                              return allArtworks;
                            })
                            //------------------------------------------------------------------------------
                            // Render the page now that we have all the artworks from the different APIs
                            //------------------------------------------------------------------------------
                            .then(data => {
                              //now that we have the allArtworks array returned from the previous .then, render that array to the artworks page.
                              res.render('pages/artworks', { artworks: data, query: artist });
                              return data;
                            })
                            //------------------------------------------------------------------------------
                            // Save the artworks to the database
                            //------------------------------------------------------------------------------
                            .then(allArtworks => {
                              //todo: how do we know if this artist is already in the db? we will be creating a lot of duplicates
                              let sql = `INSERT INTO artworks (title, description, image, artist, museum, city) VALUES ($1,$2,$3,$4,$5,$6);`;
                              allArtworks.forEach(artwork => {
                                let values = [artwork.artworkTitle, artwork.artworkDescription, artwork.artworkImage, artwork.artistName, artwork.museum, artwork.city];
                                client.query(sql, values);
                              })
                            })
                            .catch(error => handleErrors(error, res));
                        })
                        .catch(error => handleErrors(error, res));
                    })
                    .catch(error => handleErrors(error, res));
                })
                .catch(error => handleErrors(error, res));
            })
            .catch(error => handleErrors(error, res));
        })
        .catch(error => handleErrors(error, res));
    })
    .catch(error => handleErrors(error, res));
}

function handleErrors(error, res) {
  //render the error page with the provided error message.
  console.error('error message: ', error.message);
  console.error('file name: ', error.fileName);
  console.error('line number: ', error.lineNumber);
  console.error('stack trace: ', error.stack);

  if (res) {
    res.render('pages/error', { error: error });
  }
}

function pageNotFound(req, res) {
  console.error('not found');
  //res.status(404).send('Oops, can\'t find this page');
  res.render('pages/error', { error: new Error('Oooops, we couldn\'t find this page.') });
}

//catch all for unknown routes
app.get('*', pageNotFound);

//start up the server
app.listen(PORT, () => {
  console.log(`Server is up on port `, PORT);
});
