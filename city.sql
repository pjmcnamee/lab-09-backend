DROP TABLE IF EXISTS weathers;
DROP TABLE IF EXISTS yelps;
DROP TABLE IF EXISTS movies;
DROP TABLE IF EXISTS locations;


CREATE TABLE locations(
    id SERIAL PRIMARY KEY,
    search_query VARCHAR(255),
    formatted_query VARCHAR(255),
    latitude NUMERIC(8,6),
    longitude NUMERIC(9,6)
);

CREATE TABLE weathers(
    id SERIAL PRIMARY KEY,
    forecast VARCHAR(255),
    time VARCHAR(255),
    location_id INTEGER NOT NULL REFERENCES locations(id)
);

CREATE TABLE yelps(
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    image_url VARCHAR(255),
    price NUMERIC(5),
    rating NUMERIC(4,4),
    url VARCHAR(255),
    location_id INTEGER NOT NULL REFERENCES locations(id)
);

CREATE TABLE movies(
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    overview VARCHAR(255),
    average_vote NUMERIC(2,1),
    total_votes NUMERIC(8),
    image_url VARCHAR(255),
    popularity NUMERIC(8),
    released_on VARCHAR(255),
    location_id INTEGER NOT NULL REFERENCES locations(id)
);
