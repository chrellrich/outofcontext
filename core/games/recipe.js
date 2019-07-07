const _ = require('lodash');
const Story = require('./story');

const Sanitize = require('./util/Sanitize');
const Chain = require('./util/Chain');

const HOTWORD = /ITEM/g;

module.exports = class Recipe extends Story {
  constructor(lobby, config, players) {
    super(lobby, config, players);
  }


  // Find a story for a player
  findChainForPlayer(player) {
    // Find a chain for a player
    const { numSteps } = this.config;

    const fullChains = this.chains
      .filter(c => c.type !== 'comment')
      .every(c => c.chain.length == numSteps);

    if(fullChains)
      return;

    // Split up comments from ingredients / steps
    let [ comments, chains ] = _.chain(this.chains)
      .filter(c => !c.editor) // no edited recipes
      .filter(c => (c.collaborators[player] || 0) <= c.avgEdits()) // no over-contributed recipes
      .sortBy(c => c.chain.length) // shortest recipes first
      .partition(c => c.type === 'comment') // separate comments from steps and instructions
      .value()

    const available = _.chain(chains)
      .filter(c => c.chain.length < numSteps)
      .sortBy(c => !(c.type === 'step' && !c.theme))
      .value();

    // First available ingredient or step or the first available comment
    return available[0] || comments[0];
  }

  start() {
    const numPlayers = this.players.length;
    const { numRecipes, numSteps } = this.config;

    // Create chains for each recipe
    this.chains = _.range(numRecipes * 3)
      .map(() => new Chain(numPlayers, numSteps));

    // Assign a type to each chain (there are 3 kinds of chains you can edit)
    this.chains.forEach((chain, i) =>
      chain.type = ['step', 'ingredient', 'comment'][i % 3]);

    // Every player has an equal chance of getting a story
    const players = _.shuffle(this.players);

    for(const player of players) {
      const story = this.findChainForPlayer(player);
      if(!story) {
        break;
      }
      story.editor = player;
    }

    this.sendGameInfo();
  }

  handleMessage(pid, type, data) {
    const chain = this.chains.find(s => s.editor === pid);
    const noEditors = !this.chains.some(s => s.editor);

    switch(type) {

    // Handle writing the next line
    case 'recipe:theme':
      if(!chain)
        return;

      // must be actually editing a theme
      if(chain.type !== 'step' && chain.theme !== '')
        return;

      if(typeof data !== 'string')
        return;

      const line = Sanitize.str(data);

      if(line.length < 1 || line.length > 256)
        return;

      this.lastEdit[pid] = Date.now();
      chain.lastEditor = pid;
      chain.themeEditor = pid;
      chain.theme = line;
      chain.editor = '';
      chain.collaborators[pid] = (chain.collaborators[pid] || 0) + 1;

      this.redistribute();

      break;

    case 'recipe:line':
      if(!chain)
        return;

      if(chain.type === 'step' && !chain.theme)
        return;

      if(typeof data !== 'string')
        return;

      const line = Sanitize.str(data);

      if(line.length < 1 || line.length > 256)
        return;

      this.lastEdit[pid] = Date.now();
      chain.addLink(pid, line);

      this.redistribute();

      break;

    case 'recipe:done':
      this.finishedReading[pid] = data === true;
      this.sendGameInfo();

      if(this.players.every(p => this.finishedReading[p]))
        this.lobby.endGame();

      break;

    case 'chain:like':
      const progress = this.getGameProgress() && noEditors;
      if(typeof data === 'number' && data >= 0 && data <= this.chains.length && progress === 1) {
        this.chains[data].likes[pid] = !this.chains[data].likes[pid];
        this.sendGameInfo();
      }
      break;
    }
  }

  getGameProgress() {
    const { numRecipes, numSteps } = this.config;
    const totalLines = numRecipes * numSteps * 2;
    const writtenLines = _.chain(this.chains)
      .filter(c => c.type !== 'comment')
      .sumBy(c => c.chain.length);
    return writtenLines / totalLines;
  }

  getPlayerState(pid) {
    const { numSteps } = this.config;
    const chain = this.chains.find(s => s.editor === pid);
    const noEditors = !this.chains.some(s => s.editor);
    const done = this.getGameProgress() === 1 && noEditors;

    return chain ? {
      id: pid,
      state: 'EDITING',
      link:
        chain.type === 'step' ?
          (chain.theme === '' ? {
            type: 'theme'
          } : {
            type: 'step',
            theme: chain.theme,
            index: chain.length + 1,
            total: numSteps,
          }) :
        chain.type === 'ingredient' ? {
          type: 'ingredient',
          ingredients: chain.chain
        } :
        chain.type === 'comment' ? {
          type: 'comment',
          comments: chain.chain,
        } :
        { type: null },
    } : {
      id: pid,
      liked: this.chains.map(s => s.likes[pid]),
      state: done ? 'READING' : 'WAITING',
    };
  }

  compileRecipes() {
    const { comment, step, ingredient } = _.chain(this.chains)
      .shuffle()
      .groupBy('type');

    return step.map((s, i) => ({
      theme: s.theme,
      author: s.themeEditor,
      steps: _.zip([s.chain, ingredient[i].chain, s.editors, ingredient[i].editors])
        .map(([instruction, item, edtior, helper]) => ({
          link: instruction.replace(HOTWORD, item),
          editors: this.config.anonymous ? ['', ''] : [editor, helper],
        })),
      comments: _.zip(comment[i].chain, comment[i].editors)
        .map(([link, e]) => ({
          link,
          editor: this.config.anonymous ? '' : e,
        }))
    }))
  }

  getState() {
    const hasRecipe = this.chains.filter(s => s.editor).reduce((obj, i) => ({...obj, [i.editor]: i}), {});
    const progress = this.getGameProgress();
    const noEditors = !this.chains.some(s => s.editor);
    return {
      // players who are writing have pencil icons, players who are not have a clock icon
      icons: this.players.reduce((obj, p) => ({
        ...obj,
        [p]: progress === 1 && noEditors ?
          (this.finishedReading[p] ?
            'check' :
            'clock') :
          {
            wait: 'clock',
            step: hasRecipe[p] && !hasRecipe[p].theme ? 'lightbulb' : 'pencil',
            ingredient: 'shopping basket',
            comment: 'comment',
          }[hasRecipe[p] ? hasRecipe[p].type : 'wait']
      }), {}),
      progress,
      likes: this.chains.map(s => _.size(_.filter(s.likes, l => l))),
      recipes: progress === 1 && noEditors ? this.compileRecipes() : [],
    };
  }
};