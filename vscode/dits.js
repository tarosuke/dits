// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const child_process = require('child_process');
const { chdir, stdout } = require('process');

const { Repository } = require('./repository.js');



// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Congratulations, your extension "helloworld-minimal-sample" is now active!');

	//TreeViewの登録
	vscode.window.createTreeView('log', {
		treeDataProvider: new LogTreeviewProvider(
			vscode.workspace.workspaceFolders)
	});

	//コマンドの登録
	context.subscriptions.push(
		vscode.commands.registerCommand('dits.newChild', () => {
			vscode.window.showInformationMessage('New Child!');
	}));
}

// this method is called when your extension is deactivated
function deactivate() { }

// eslint-disable-next-line no-undef
module.exports = {
	activate,
	deactivate
}



class LogTreeviewProvider {
	constructor(v) {
		this.repos = new Repository;
	}
	getTreeItem(v) {
		return {
			label: v,
			collapsibleState: v.collapsibleState, //ブランチノードのときは設定する
		};
	}
	getChildren(v) {
		return this.repos.items;
	}

	// onDidChangeTreeData
}

class Data extends vscode.TreeItem {
	constructor(collapsibleState) {
		super(label, collapsibleState);
	}
}
