'use babel';
/* @flow */

import { CompositeDisposable } from 'atom';
import path from 'path';

import handleData from './message.js';
import * as servers from './servers.js';

import type { LinterMessage } from './message';

type BufferType = {
  cachedText: string;
  getText(): string;
}

type TextEditorType = {
  getPath(): string;
  buffer: BufferType;
  isModified(): boolean;
}

type Linter = {
  grammarScopes: Array<string>;
  scope: 'file' | 'project';
  name?: string;
  lintOnFly: boolean;
  lint(TextEditor: TextEditorType): Array<LinterMessage> | Promise<Array<LinterMessage>>;
};

export default {
  config: {
    executablePath: {
      type: 'string',
      default: 'flow',
      description: 'Absolute path to the Flow executable on your system.',
    },
    enableAll: {
      type: 'boolean',
      default: false,
      description: 'Typecheck all files, not just @flow',
    },
  },

  activate(): void {
    require('atom-package-deps').install('linter-flow');

    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(atom.config.observe('linter-flow.executablePath', (pathToFlow) => {
      this.pathToFlow = pathToFlow;
    }));
    this.subscriptions.add(atom.config.observe('linter-flow.enableAll', (enableAll) => {
      this.enableAll = enableAll;
    }));
  },

  deactivate(): void {
    servers.stop();
    this.subscriptions.dispose();
  },

  provideLinter(): Linter {
    const helpers = require('atom-linter');

    return {
      grammarScopes: [
        'source.js',
        'source.js.jsx',
        'source.babel',
        'source.js-semantic',
        'source.es6',
      ],
      scope: 'project',
      name: 'Flow',
      lintOnFly: true,
      lint: (TextEditor) => {
        const filePath = TextEditor.getPath();
        const fileText = TextEditor.buffer.cachedText;

        // Is flow enabled for current file ?
        if (fileText.indexOf('@flow') === -1 && !this.enableAll) {
          return [];
        }

        // Check if .flowconfig file is present
        const flowConfig = helpers.find(filePath, '.flowconfig');
        if (!flowConfig) {
          atom.notifications.addWarning('[Linter-Flow] Missing .flowconfig file.', {
            detail: 'To get started with Flow, run `flow init`.',
            dismissable: true,
          });
          return [];
        }

        let args;
        let options;

        // Use `check-contents` for unsaved files. and `status` for saved files.
        if (TextEditor.isModified()) {
          args = ['check-contents', '--json', filePath];
          options = { cwd: path.dirname(filePath), stdin: fileText };
        } else {
          args = ['status', '--json', filePath];
          options = { cwd: path.dirname(filePath) };
        }

        return servers.start(this.pathToFlow, flowConfig, this.enableAll).then(() =>
          helpers
            .exec(this.pathToFlow, args, options)
            .then(JSON.parse)
            .then(handleData)
        );
      },
    };
  },
};
