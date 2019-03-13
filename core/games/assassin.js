const Game = require('./game');
const _ = require('lodash');
const fs = require('fs');
const path = require('path');

const DICT_START = 3000;
const DICT_END = 8000;
const DICT_FILE = '10000words.dict';

function readDict(file) {
  return String(fs.readFileSync(path.join(__dirname, 'dicts', file)))
    .split('\n');
}

const WORDS = readDict(DICT_FILE).slice(DICT_START, DICT_END - DICT_START);
const ANIMALS = readDict('animals.dict');
const COLORS = readDict('colors.dict');

module.exports = class Assassin extends Game {
  constructor(lobby, config, players) {
    super(lobby, config, players);
    this.words = {};
    this.targets = {};
    this.finishedLooking = {};
    this.title = '';
  }

  start() {
    const { numWords } = this.config;
    const numPlayers = this.players.length;
    this.title = `${_.sample(COLORS)} ${_.sample(ANIMALS)}`;

    this.words = _.chain(WORDS)
      .sampleSize(numWords * numPlayers) // Grab enough for each player
      .chunk(numWords) // Chunk into `numWords` sized chunks
      .zip(this.players) // pair with a player
      .map(_.reverse) // put the player id first
      .fromPairs() // Make an object from pairs
      .value();

    const shuffled = _.shuffle(this.players);
    this.targets = shuffled.reduce((obj, pid, i) => ({
        ...obj,
        [pid]: shuffled[(i + 1) % numPlayers],
      }), {});

    this.finishedLooking = {};

    this.sendGameInfo();
  }

  stop() {}

  cleanup() {}

  handleMessage(pid, type, data) {
    switch(type) {

    case 'assassin:done':
      this.finishedLooking[pid] = data === true;
      this.sendGameInfo();
      break;
    }
  }

  getPlayerState(pid) {
    return {
      id: pid,
      title: this.title,
      state: this.finishedLooking[pid] ? 'DONE' : 'READING',
      target: this.targets[pid],
      words: this.words[pid],
    };
  }

  getState() {
    return {
      // players who are writing have pencil icons, players who are not have a clock icon
      icons: this.players.reduce((obj, p) => ({
        ...obj,
        [p]: this.finishedLooking[p] ? 'check' : 'clock',
      }), {}),
    };
  }
};