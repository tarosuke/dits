

const vscode = require('vscode');
const child_process = require('child_process');
const { chdir, stdout } = require('process');


exports.Repository = function () {
	this.items = [];
	this.children = [];
	var out = Git(['log', '--oneline', '--no-decorate'], 'dits');
	if (out) {
		const outStr = out.slice(1, -1);
		// console.log(outStr);
		for (var item of outStr.split('\n')) {
			item = item.trim();
			if (item.length) {
				//各コミット分
				const commit = {
					hash: item.slice(1, 7).trim(),
					label: item.slice(8).trim(),
					collapsibleState: null
				};
				if (commit.label.indexOf('.dits') < 0) {
					//コメント
					this.items.push(commit);
				} else {
					//コマンド
					vscode.window.log(commit.label);
					const cargs = commit.label.split(' ');
					switch (cargs[1]) {
						case 'new': //新規子チケット
							this.children.push(commit.id);
							break;
						default:
							break;
					}
				}
			}
		}
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

