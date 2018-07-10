# libmseedjs

NodeJS library for reading mSEED records. Pass the record function a buffer of 512 byte mSEED record:

## Installation

    npm install libmseedjs

## Usage

    const mSEEDRecord = require("libmseedjs");

    var record = new mSEEDRecord(<Buffer>);
