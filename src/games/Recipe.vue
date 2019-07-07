<template>
  <div>
    <div v-if="player.state === 'EDITING'"
      style="margin: 16px 0">
      <h2 is="sui-header" icon="lightbulb" v-if="player.link.type === 'theme'">
        Choose a theme for this "dish"
      </h2>
      <h2 is="sui-header" icon="pencil" v-if="player.link.type === 'step'">
        Write an instruction for {{player.link.theme}}
        <sui-header-subheader>
          Step #{{player.link.index + 1}}/{{player.link.total}}
        </sui-header-subheader>
      </h2>
      <h2 is="sui-header" icon="comment" v-if="player.link.type === 'comment'">
        Comment on a recipe.{{player.link.comments.length ? ' Other reviewers wrote:' : ''}}
        <div style="margin-top: 10px">
          <div v-for="(comment, i) in player.link.comments">
            <sui-divider horizontal v-if="i !== 0"></sui-divider>
            <sui-header-subheader>
              {{comment}}
            </sui-header-subheader>
          </div>
        </div>
      </h2>
      <h2 is="sui-header" icon="comment" v-if="player.link.type === 'ingredient'">
        Add ingredient.{{player.link.ingredients.length ? ' Other ingredients are:' : ''}}
        <div style="margin-top: 10px">
          <div v-for="(ingredients, i) in player.link.ingredients">
            <sui-divider horizontal v-if="i !== 0"></sui-divider>
            <sui-header-subheader>
              {{ingredients}}
            </sui-header-subheader>
          </div>
        </div>
      </h2>
      <sui-form @submit="writeLine" v-if="player.link.type !== 'step'">
        <sui-form-field>
          <label>{{{
            ingredient: 'An Object or Thing',
            comment: 'Recipe Comment',
            theme: '"Dish" Theme',
          }[player.link.type]}}</label>
          <textarea v-model="line" rows="2">
          </textarea>
          <div class="char-count">
            {{line.length}}/256
          </div>
        </sui-form-field>
        <sui-button type="submit"
          :color="player.isLastLink ? 'green' : 'blue'"
          :disabled="line.length < 1 || line.length > 256">
          {{player.isLastLink ? 'Finish' : 'Sign'}}
        </sui-button>
      </sui-form>
      <sui-form @submit="writeLine" v-if="player.link.type === 'step'">
        <sui-form-field>
          <label>Instructions for Step #{{player.link.index + 1}}. Write <b>ITEM</b> to denote the ingredient.</label>
          <textarea v-model="line" rows="2">
          </textarea>
          <div class="char-count">
            <span v-if="line.indexOf('ITEM') === -1">
              <b>ITEM</b> must be in the instruction.
            </span> {{line.length}}/256
          </div>
        </sui-form-field>
        <sui-button type="submit"
          :color="player.isLastLink ? 'green' : 'blue'"
          :disabled="line.length < 1 || line.length > 256 || line.indexOf('ITEM') === -1">
          {{player.isLastLink ? 'Finish' : 'Sign'}}
        </sui-button>
      </sui-form>
    </div>
    <div v-else-if="player.state === 'WAITING'"
      style="margin: 16px">
      <sui-loader active centered inline size="huge">
        Waiting on Other Chefs
      </sui-loader>
    </div>
    <div v-else-if="player.state === 'READING' || !player.state && game.recipes && game.recipes.length">
      <sui-divider horizontal>
        Recipes
      </sui-divider>
      <div style="text-align: left">
        <div v-for="(story, i) in game.recipes" :key="i">
          <sui-divider horizonal v-if="i > 0"></sui-divider>
          <sui-card>
            <div class="like-bar">
              <div :is="player.state ? 'sui-button' : 'sui-label'"
                :color="player.state && !player.liked[i] ? 'grey' : 'red'"
                @click="player.state && $socket.emit('game:message', 'chain:like', i)"
                icon="heart"
                size="tiny">
                {{game.likes[i]}}
              </div>
            </div>
            <sui-card-content :style="{marginBottom: story[0].editor ? 0 : '14px'}">
              <sui-comment-group>
                <sui-comment v-for="(entry, j) in story" :key="j">
                  <sui-comment-content>
                    <sui-comment-text>
                      <p style="font-family: 'Lora', serif;">
                        {{entry.link}}
                      </p>
                    </sui-comment-text>
                    <sui-comment-author v-if="nameTable[entry.editor]"
                      style="text-align: right;">
                      &mdash;{{nameTable[entry.editor]}}
                    </sui-comment-author>
                  </sui-comment-content>
                </sui-comment>
              </sui-comment-group>
            </sui-card-content>
          </sui-card>
        </div>
      </div>
      <sui-button v-if="player.state === 'READING'"
        style="margin-top: 16px"
        @click="$socket.emit('game:message', 'recipe:done', game.icons[player.id] !== 'check')"
        primary
        :basic="game.icons[player.id] === 'check'" >
        {{game.icons[player.id] === 'check' ? 'Still Reading' : 'Done Reading'}}
      </sui-button>
    </div>
    <div v-else style="margin: 16px">
      <sui-loader active centered inline size="huge">
        Stories are Being Written
      </sui-loader>
    </div>
    <sui-progress
      v-if="game.progress !== 1"
      state="active"
      progress
      indicating
      :percent="Math.round((game.progress || 0) * 100)"/>
  </div>
</template>

<style>

.field {
  position: relative;
}

.sub.header {
  word-break: break-word;
  max-width: 292px;
}

</style>

<script>
export default {
  sockets: {
    'lobby:info': function(info) {
      this.lobby = info;
    },
    'game:info': function(info) {
      this.game = info;
    },
    'game:player:info': function(info) {
      if(this.player.state !== info.state) {
        switch(info.state) {
        case 'WAITING':
          this.line = '';
          break;
        case 'EDITING':
          vibrate(40);
          break;
        case 'READING':
          vibrate(40, 100, 40);
          break;
        }
      }
      this.player = info;
    }
  },
  created() {
    this.$socket.emit('game:info');
    this.$socket.emit('lobby:info');
  },
  computed: {
    nameTable() {
      return this.lobby.players.reduce((obj, p) => ({...obj, [p.playerId]: p.name}), {});
    }
  },
  methods: {
    writeLine(event) {
      event.preventDefault();

      if(this.line.length < 1 || this.line.length > 256)
        return;

      this.$socket.emit(
        'game:message',
        this.player.link.type === 'theme' ? 'recipe:theme' : 'recipe:line',
        this.line
      );
      this.line = '';
    }
  },
  data() {
    return {
      line: '',
      player: { state: '', id: '', },
      game: { icons: {}, likes: [], },
      lobby: ({
        admin: '',
        players: [],
        members: [],
        spectators: [],
        game: '',
        config: {},
      }),
    };
  },
};
</script>