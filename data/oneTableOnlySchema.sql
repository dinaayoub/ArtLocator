DROP TABLE IF EXISTS artworks;
DROP TABLE IF EXISTS artists;
DROP TABLE IF EXISTS museums;
DROP TABLE IF EXISTS cities;


CREATE TABLE artworks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    description TEXT,
    image VARCHAR(255),
    artist VARCHAR(255),
    museum VARCHAR(255),
    city VARCHAR(255)
);



