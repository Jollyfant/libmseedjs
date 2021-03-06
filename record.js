const mSEEDHeader = require("./header");

function mSEEDRecord(data) {

  /* Class mSEEDRecord
   *
   * Container for keeping mSEED record information
   */

  var dataStart = data.readUInt16BE(44);
  
  if(dataStart < 48) {
    throw("The record data start value is invalid.");
  }
  
  // Read the mSEED header
  this.header = new mSEEDHeader(data.slice(0, dataStart));

  // Create an array of unpacked data samples
  this.data = this.unpackData(data.slice(dataStart, this.header.recordLength));

}

mSEEDRecord.prototype.unpackData = function(data) {

  /* Function mSEEDRecord.UnpackData
   * 
   * Unpacks data frames and returns an
   * array of data
   */

  // SEED 2.4 Manual page 123
  const ENCODING_ASCII = 0;
  const ENCODING_INT16 = 1;
  const ENCODING_INT32 = 3;
  const ENCODING_FLOAT32 = 4;
  const ENCODING_FLOAT64 = 5;
  const ENCODING_STEIM1 = 10;
  const ENCODING_STEIM2 = 11;

  // Unpack STEIM1 or STEIM2 depending on the encoding
  if(this.header.encoding === ENCODING_ASCII) {
    return this.unpackASCII(data);
  } else if(this.header.encoding === ENCODING_INT32) {
    return this.unpack32BitInt(data);
  } else if(this.header.encoding === ENCODING_FLOAT32) {
    return this.unpack32BitFloat(data);
  } else if(this.header.encoding === ENCODING_FLOAT64) {
    return this.unpack64BitFloat(data);
  } else if(this.header.encoding === ENCODING_INT16) {
    return this.unpack16BitInt(data);
  } else if(this.header.encoding === ENCODING_STEIM1) {
    return this.unpackSTEIM1(data);
  } else if(this.header.encoding === ENCODING_STEIM2) {
    return this.unpackSTEIM2(data);
  } else {
    throw("Unknown encoding: could not unpack data!");
  }

}

mSEEDRecord.prototype.id = function() {

  /* Function mSEEDRecord.id
   * 
   * Returns the stream identifier
   *
   */

  return [
    this.header.network,
    this.header.station,
    this.header.location,
    this.header.channel
  ].join(".");

}

mSEEDRecord.prototype.payload = function() {

  /* Function mSEEDRecord.payload
   *
   * Returns payload representation of header
   * and record data
   */

  return {
    'start': this.header.start,
    'end': this.header.end,
    'data': this.data,
    'network': this.header.network,
    'station': this.header.station,
    'location': this.header.location,
    'channel': this.header.channel,
    'sampleRate': this.header.sampleRate,
    'id': this.id()
  }

}

mSEEDRecord.prototype.unpack64BitFloat = function(data) {

  /* Function mSEEDRecord.unpack64BitFloat
   *
   * Unpacks 64F data
   */

  var samples = new Array();

  for(var i = 0; i < this.header.nSamples; i++) {
    samples.push(data.readDoubleBE(i * 8));
  }

  return samples;

}

mSEEDRecord.prototype.unpackASCII = function(data) {

  /* Function mSEEDRecord.unpackASCII
   *
   * Unpacks ASCII encoded data
   */

  return data.toString("ascii");

}

mSEEDRecord.prototype.unpack32BitFloat = function(data) {

  /* Function mSEEDRecord.unpack64BitFloat
   *
   * Unpacks 32F data
   */

  var samples = new Array();

  for(var i = 0; i < this.header.nSamples; i++) {
    samples.push(data.readFloatBE(i * 4));
  }

  return samples;

}

mSEEDRecord.prototype.unpack16BitInt = function(data) {

  /* Function mSEEDRecord.unpack16BitInt
   *
   * Unpacks int16 data
   */

  var samples = new Array();

  for(var i = 0; i < this.header.nSamples; i++) {
    samples.push(data.readInt16BE(i * 2));
  }

  return samples;

}

mSEEDRecord.prototype.unpack32BitInt = function(data) {

  /* Function mSEEDRecord.unpack32BitInt
   *
   * Unpacks int32 data
   */

  var samples = new Array();

  for(var i = 0; i < this.header.nSamples; i++) {
    samples.push(data.readInt32BE(i * 4));
  }

  return samples;

}

mSEEDRecord.prototype.unpackSTEIM1 = function(data) {

  /* Function mSEEDRecord.unpackSTEIM1
   *
   * Unpacks STEIM1 encoded data record
   * and returns the array of data
   *
   * Implemented after SEED manual V2.4
   */

  var first = data.readInt32BE(4);
  var last = data.readInt32BE(8);

  var diff = new Array();
  var nibble;
  var nFrames = this.header.nFrames || (data.length / 64);

  for(var i = 0; i < nFrames; i++) {

    w0 = data.readInt32BE(i * 64);

    for(var j = 0; j < 16; j++) {

      nibble = (w0 >> ((16 - j - 1) * 2)) & 0x03

      switch(nibble) {

        // Empty nibble
        case 0x00:
          break;

        // Four 8-bit differences
        case 0x01:
          for(var k = 0; k < 4; k++) {
            diff.push(data.readInt8((i * 64) + (j * 4) + k));
          }
          break;

        // Two 16-bit differences
        case 0x02:
          for(var k = 0; k < 2; k++) {
            diff.push(data.readInt16BE((i * 64) + (j * 4) + (k * 2)));
          }
          break;

        // One 32-bit difference
        case 0x03:
          diff.push(data.readInt32BE((i * 64) + (j * 4)));
          break;
      }

    }

  }

  // Construct the samples array of data diff
  var samples = [first];
  for(var i = 1; i < diff.length; i++) {
    samples.push(samples[i - 1] + diff[i]);
  }

  if(samples.length !== this.header.nSamples) {
    throw("[STEIM1] Data integrity check failed: number of samples does not match");
  }

  // Do a final integrity check
  if(samples[samples.length - 1] !== last) {
    throw("[STEIM1] Data integrity check failed: reverse integration constant does not match");
  }

  return samples;

}

mSEEDRecord.prototype.unpackSTEIM2 = function(data) {

  /* Function unpackSTEIM2
   *
   * Unpacks STEIM2 encoded data record
   * and returns the array of data
   *
   * Implemented after libmseed
   */

  // Read the first (X0) and last sample (XN)
  var first = data.readInt32BE(4);
  var last = data.readInt32BE(8);

  var nibble;
  var decodeNibble;
  var wn, w0;
  var val;
  var nFrames = this.header.nFrames || (data.length / 64);

  // Array to collect STEIM2 differences
  var diff = new Array();

  // Go over the data frames
  for(var i = 0; i < nFrames; i++) {

    w0 = data.readInt32BE(i * 64);

    // Go over the 16 32-bit long words in a frame
    for(var j = 0; j < 16; j++) {

      // Read the Cj of w0 from left to right
      nibble = (w0 >> ((16 - j - 1) * 2)) & 0x03;

      // Empty nibble
      if(nibble === 0) {
        continue;
      }

      if(nibble === 1) {

        // STEIM-1 four 8-bit differences
        for(var k = 0; k < 4; k++) {
          diff.push(data.readInt8((i * 64) + (j * 4) + k));
        }

      } else if(nibble === 2) {

        // Read the top two bits to find the decodeNibble
        wn = data.readInt32BE((i * 64) + (j * 4));
        decodeNibble = (wn >> 30) & 0x3;

        switch(decodeNibble) {

          // One 30-bit difference
          case 0x01:
            for(var k = 0; k < 1; k++) {
              val = (wn >> ((1 - k - 1) * 30)) & 0x3fffffff;
              val = (val & 0x20000000) ? val | ~0x3fffffff : val;
              diff.push(val);
            }
            break;

          // Two 15-bit differences
          case 0x02:
            for(var k = 0; k < 2; k++) {
              val = (wn >> ((2 - k - 1) * 15)) & 0x00007fff;
              val = (val & 0x00004000) ? val | ~0x00007fff : val;
              diff.push(val);
            }
            break;

          // Three 10-bit differences
          case 0x03:
            for(var k = 0; k < 3; k++) {
              val = (wn >> ((3 - k - 1) * 10)) & 0x000003ff;
              val = (val & 0x00000200) ? val | ~0x000003ff : val;
              diff.push(val);
            }
            break;

          default:
            throw("[STEIM2] Data integrity check failed: unknown decode nibble");

        }

      } else if(nibble === 3) {

        // Read the top two bits to find the decodeNibble
        wn = data.readInt32BE((i * 64) + (j * 4));
        decodeNibble = (wn >> 30) & 0x3;

        switch(decodeNibble) {

          // Five 6-bit differences
          case 0x00:
            for(var k = 0; k < 5; k++) {
              val = (wn >> ((5 - k - 1) * 6)) & 0x0000003f;
              val = (val & 0x00000020) ? val | ~0x0000003f : val;
              diff.push(val);
            }
            break;

          // Six 5-bit differences
          case 0x01:
            for(var k = 0; k < 6; k++) {
              val = (wn >> ((6 - k - 1) * 5)) & 0x0000001f;
              val = (val & 0x00000010) ? val | ~0x0000001f : val;
              diff.push(val);
            }
            break;

          // Seven 4-bit differences
          case 0x02:
            for(var k = 0; k < 7; k++) {
              val = (wn >> ((7 - k - 1) * 4)) & 0x0000000f;
              val = (val & 0x00000008) ?  val | ~0x0000000f : val;
              diff.push(val);
            }
            break;

          default:
            throw("[STEIM2] Data integrity check failed: unknown decode nibble");

        }

      }

    }

  }

  // Construct the samples array of data diff
  var samples = [first];
  for(var i = 1; i < diff.length; i++) {
    samples.push(samples[i - 1] + diff[i]);
  }

  if(samples.length !== this.header.nSamples) {
    throw("[STEIM2] Data integrity check failed: number of samples does not match");
  }

  // Do a final integrity check
  if(samples[samples.length - 1] !== last) {
    throw("[STEIM2] Data integrity check failed: reverse integration constant does not match");
  }

  return samples;

}

module.exports = mSEEDRecord;
