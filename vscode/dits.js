// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const child_process = require('child_process');
const { chdir } = require('process');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Congratulations, your extension "helloworld-minimal-sample" is now active!');

	vscode.window.showInformationMessage('Hello World!');


	//gitの起動と出力の回収
//	const proc = child_process.spawn('git', ['commit', '-a', '-m', 'gitを動かせたので'], chdir('dits'));
	const proc = child_process.spawn('git', ['status']);
	console.log("child:" + proc.pid);
	proc.stdout.on('data', (data) => {
		console.log(data.toString());
	});
	proc.stderr.on('data', (data) => {
		console.error(data.toString());
	});


}

// this method is called when your extension is deactivated
function deactivate() { }

// eslint-disable-next-line no-undef
module.exports = {
	activate,
	deactivate
}
