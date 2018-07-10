function mSEEDHeader(data) {

  /* Class mSEEDHeader
   *
   * Container for the fixed header section
   * of a miniSEED record
   */

  this.sequenceNumber = data.toString("ascii", 0, 6);
  this.dataQuality = data.toString("ascii", 6, 7);

  this.encoding = null;
  this.byteOrder = null;
  this.timingQuality = null;
  this.microSeconds = null;
  this.recordLength = null;
  this.sampleRate = null;
  this.nFrames = null;
  this.nBlockettes = data.readUInt8(39);

  // Go over the mSEED blockette chain
  this.readBlocketteChain(data);

  // Only do big endian
  if(!this.byteOrder) {
    throw("Little endian byte order not supported.");
  }

  this.nSamples = data.readUInt16BE(30);

  // Read the sample rate if unset by blockette 500
  if(this.sampleRate === null) {
    this.sampleRate = this.readSampleRate(data);
  }

  // Read the mSEED header bit flags
  this.readBitFlags(data);

  this.timingCorrection = data.readInt32BE(40);

  this.readRecordStart(data);

  this.end = this.start + 1E3 * (this.nSamples / this.sampleRate);

  this.SetStreamId(data);

}

mSEEDHeader.prototype.readSampleRate = function(data) {

  /* Function mSEEDHeader.readSampleRate
   *
   * Calculates the sample rate from the multiplication factor
   */

  var sampleRateFactor = data.readInt16BE(32);
  var sampleRateMult = data.readInt16BE(34);

  // Calculate the sample rate from the factor and multiplier
  if(sampleRateFactor > 0 && sampleRateMult > 0) {
    return sampleRateMult * sampleRateFactor;
  } else if(sampleRateFactor > 0 && sampleRateMult < 0) {
    return -sampleRateFactor / sampleRateMult;
  } else if(sampleRateFactor < 0 && sampleRateMult > 0) {
    return -sampleRateMult / sampleRateFactor;
  } else if(sampleRateFactor < 0 && sampleRateMult < 0) {
    return 1 / (sampleRateFactor * sampleRateMult);
  }

  return null;

}

mSEEDHeader.prototype.readBitFlags = function(data) {

  /* Function mSEEDHeader.readBitFlags
   * 
   * Reads the mSEED header bit-flags
   */

  this.flags = {
    "activity": data.readUInt8(36),
    "clock": data.readUInt8(37),
    "quality": data.readUInt8(38)
  }

}

mSEEDHeader.prototype.readBlocketteChain = function(data) {

  /* Function mSEEDHeader.readBlocketteChain
   *
   * Reads the mSEED blockette chain and sets values
   */

  var blocketteStart = data.readUInt16BE(46);
  var blockette;
  var blocketteCounter = 0;

  // Run over the blockette chain
  while(blocketteStart) {

    blocketteCounter++;

    blockette = data.readUInt16BE(blocketteStart);

    switch(blockette) {

      // Case of blockette 1000
      case 1000:
        this.encoding = data.readUInt8(blocketteStart + 4);
        this.byteOrder = data.readUInt8(blocketteStart + 5);
        this.recordLength = 1 << data.readUInt8(blocketteStart + 6);
        break;

      // Blockette 1001: read the microseconds and number of data frames
      case 1001:
        this.timingQuality = data.readUInt8(blocketteStart + 4);
        this.microSeconds = data.readInt8(blocketteStart + 5);
        this.nFrames = data.readUInt8(blocketteStart + 7);
        break;

      // Blockette 100: read the overruling sample rate
      case 100:
        this.sampleRate = data.readFloatBE(blocketteStart + 4);
        break;
    }

    blocketteStart = data.readUInt16BE(blocketteStart + 2);

  }

  // Sanity check on the number of blockettes
  if(blocketteCounter !== this.nBlockettes) {
    throw("Number of blockettes does not match number encountered.");
  }

}

mSEEDHeader.prototype.SetStreamId = function(data) {

  /* Function mSEEDHeader.SetStreamId
   *
   * Reads and sets stream parameters
   * according to the mSEED Manual
   */

  // Read the stream identifiers and trim any padded white spaces
  this.station = data.toString("ascii", 8, 13).trim();
  this.location = data.toString("ascii", 13, 15).trim();
  this.channel = data.toString("ascii", 15, 18).trim();
  this.network = data.toString("ascii", 18, 20).trim();

}

mSEEDHeader.prototype.readRecordStart = function(data) {

  /* Function mSEEDHeader.readRecordStart
   *
   * Reads record starttime from BTIME encoding
   * according to the mSEED Manual
   */

  // Get the record starttime truncated to miliseconds
  // We cannot go under submilisecond precision
  this.start = new Date(
    data.readUInt16BE(20), 
    0,
    1,
    data.readUInt8(24),
    data.readUInt8(25),
    data.readUInt8(26),
    (1E-1 * data.readUInt16BE(28)) | 0
  ).setDate(data.readUInt16BE(22));

  // Apply timing correction (0.0001 seconds)
  // We only have milisecond precision
  if(!(this.flags.activity & 2)) {
    this.start = this.start + ((1E-1 * this.timingCorrection) | 0);
  }

}

module.exports = mSEEDHeader;
