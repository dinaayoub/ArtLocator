DROP TABLE IF EXISTS artworks;
DROP TABLE IF EXISTS artists;
DROP TABLE IF EXISTS cities;
DROP TABLE IF EXISTS museums;

CREATE TABLE cities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    country VARCHAR(255)
);

CREATE TABLE artists (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255)
);

CREATE TABLE museums (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    CONSTRAINT city_id FOREIGN KEY(id) REFERENCES cities(id)
);

CREATE TABLE artworks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    description TEXT,
    image VARCHAR(255),
    CONSTRAINT artist_id FOREIGN KEY(id) REFERENCES artists(id),
    CONSTRAINT museum_id FOREIGN KEY(id) REFERENCES museums(id)
);



