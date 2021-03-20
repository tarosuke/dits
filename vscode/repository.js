

const vscode = require('vscode');
const child_process = require('child_process');
const { chdir, stdout } = require('process');


exports.Repository = function () {
	this.items = [];
	var out = Git(['log', '--oneline', '--no-decorate'], 'dits');
	if (out) {
		const outStr = out.slice(1, -1);
		console.log(outStr);
		for (const item of outStr.split('\n')) {
			if (item.trim().length) {
				//各コミット分
				const commit = {
					hash: item.slice(1, 7).trim(),
					label: item.slice(8).trim(),
					collapsibleState: null
				};



				this.items.push(commit);
			}
		}
	} else {
		vscode.window.showErrorMessage(out.stderr.toString());
	}
};


Git = function (args, c) {
	var out = child_process.spawnSync(
		'git',
		['log', '--oneline', '--no-decorate'],
		{ cwd: 'dits' });
	if (out.status) {
		vscode.window.showErrorMessage(out.stderr.toString());
		return;
	}
	return out.output.toString();
};

