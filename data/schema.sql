DROP TABLE IF EXISTS artworks CASCADE;
DROP TABLE IF EXISTS artists CASCADE;
DROP TABLE IF EXISTS cities CASCADE;
DROP TABLE IF EXISTS museums CASCADE;

CREATE TABLE artists (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255)
);

CREATE TABLE museums (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    city VARCHAR(255)
);

CREATE TABLE artworks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    description TEXT,
    image VARCHAR(255),
    artist VARCHAR(255),
    museum VARCHAR(255)
);



