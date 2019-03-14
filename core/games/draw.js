const Game = require('./game');
const _ = require('lodash');
const Story = require('./story');

module.exports = class Draw extends Story {
  constructor(lobby, config, players) {
    super(lobby, config, players);

    this.config.numStories = config.players;

    // Make sure the same player does not edit the chain until other players had a chance
    this.clearance = config.players - 1;
  }

  handleMessage(pid, type, data) {
    const chain = this.chains.find(s => s.editor === pid);
    const expectedType = chain && chain.chain.length % 2 == 0 ? 'desc' : 'image';

    switch(type) {

    // Handle passing of images
    case 'draw:image':
      if(!chain || expectedType !== 'image')
        return;
      
      if(!data.every(l => l[0] === 'Path'))
        return;

      chain.addLink(pid, {type: 'image', data});

      this.lastEdit[pid] = Date.now();
      this.redistribute();

    // Handle passing of descriptions
    case 'draw:desc':
      if(!chain || expectedType !== 'desc')
        return;

      const line = data.replace(/[\u200B-\u200D\uFEFF\n\t]/g, '').trim();

      if(line.length < 1 || line.length > 255)
        return;

      this.lastEdit[pid] = Date.now();
      chain.addLink(pid, {type: 'desc', data: line});

      this.redistribute();

      break;

    case 'draw:done':
      this.finishedReading[pid] = data === true;
      this.sendGameInfo();
      break;
    }
  }

  getState() {
    const hasChain = this.chains
      .filter(s => s.editor)
      .reduce((obj, i) => ({
        ...obj,
        [i.editor]: i.chain.length % 2 == 0 ? 'pencil' : 'paint brush'
      }), {});

    const progress = this.getGameProgress();
    return {
      // players who are writing have pencil icons, players who are not have a clock icon
      icons: this.players.reduce((obj, p) => ({
        ...obj,
        [p]: progress === 1 ?
          (this.finishedReading[p] ? 'check' : 'clock') :
          (hasChain[p] || 'clock')
      }), {}),
      progress,
      timeLimit: this.config.timeLimit,
      colors: this.config.colors,
      chains: progress === 1 ? this.compileStories() : [],
    };
  }
};