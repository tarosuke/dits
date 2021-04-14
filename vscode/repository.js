

const vscode = require('vscode');
const child_process = require('child_process');
const fs = require("fs");



class Branch{
	constructor(log, branch) {
		this.items = [];
		this.children = [];
		this.closed = [];
		this.deleted = [];
		this.closedChildren = [];
		this.branches = [];

		//ブランチ名一覧を取得
		this.ParseBranch(branch);

		//ログをパース
		for (var item of log.split('\n')) {
			item = item.trim();
			if (item.length) {
				const tokens = item.split(' ');
				const hashLen = tokens[0].length;

				//各コミット分
				var commit = {
					hash: tokens[0],
					label: item.slice(hashLen).trim(),
					collapsibleState: null
				};

				if (!this.ParseCommitLabel(commit)) {
					break;
				}
			}
		}

		if (!this.currentTitle) {
			//カレントISSUEのタイトル代わりにhashを設定しておく
			this.currentTitle = this.branch;
		}
	}
	ParseBranch = function (b) {
		for (let item of b.split('\n')) {
			item = item.trim().split(' ');
			if (item[0] == '*') {
				//カレントISSUEのhashを取得
				this.branch = item[1].trim();
				this.branches.push(item[1].trim());
			} else {
				this.branches.push(item[0].trim());
			}
		}
	}
	ParseCommitLabel = function(commit) {
		//コミットラベルをパース
		const cargs = commit.label.split(' ');
		switch (cargs[0]) {
			case '.dits':
				//コマンド
				switch (cargs[1]) {
					case 'new': //新規子チケット
						commit.label = commit.label.slice(10);
						const h = `#${commit.hash}`;
						if (this.deleted.indexOf(h) < 0) {
							const ce = this.closed.find(
								e => e.hash == commit.hash);
							if (!ce) {
								if (this.branches.indexOf(h) < 0) {
									//ブランチがないので新規フラグ
									commit.notOpened = true;
								}
								this.children.push(commit);
							} else {
								commit.revision = ce.revision;
								this.closedChildren.push(commit);
							}
						}
						break;
					case 'open': //ブランチの始まり=解析終了
						if (!this.currentTitle) {
							this.currentTitle = commit.label.slice(11);
						}
						return false;
					case 'delete': //削除済み子チケット
						this.deleted.push(cargs[2]);
						break;
					case 'parent': //superIssueの設定
					case 'super':
						if (!this.parent) {
							this.parent = cargs[2];
						}
						break;
					case 'title': //チケットのタイトル
						if (!this.currentTitle) {
							this.currentTitle = commit.label.slice(12);
						}
						break;
					case 'release': //リリース情報
						this.revision = cargs[2];
						if (!this.lastRevision) {
							this.lastRevision = this.revision;
						}
						break;
					default:
						break;
				}
				break;
			case 'Merge': //merge=closed
				this.closed.push({
					hash: cargs[2].slice(cargs[2][1] == '#' ? 2 : 1, -1),
					revision: this.revision
				});
				break;
			default: //コメント
				this.items.push(commit);
				break;
		}
		return true;
	}
};




exports.Repository = function () {
	if (vscode.workspace.workspaceFolders) {
		this.currentPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
	}

	//workspacesにTreeViewを設定
	vscode.window.createTreeView('workspaces', {
		treeDataProvider: new WorkspaceProvider()
	});

	//Git呼び出し
	this.Do = function (args, supressError=false) {
		if (!this.currentPath) {
			return;
		}
		var out = child_process.spawnSync(
			'git', args, { cwd: this.currentPath });
		if (out.status) {
			if (!supressError) {
				vscode.window.showErrorMessage(out.stderr.toString());
			}
			return;
		}
		return out.output.toString().slice(1, -1);
	}

	//メッセージだけ空コミット
	this.CommitMessage = function (message) {
		this.Do(['commit', '--allow-empty', '-m', message]);
	}

	//ブランチ情報取得
	this.GetBranch = function () {
		return this.currentPath ? this.branch.items : [];
	}
	this.GetParent = function () {
		return this.currentPath ? this.branch.parent : "";
	}
	this.GetCurrentBranch = function () {
		return this.currentPath ? this.branch.currentTitle : "";
	}
	this.GetProgress = function () {
		if (!this.currentPath) {
			return -1;
		}
		let numChild =
			this.branch.children.length +
			this.branch.closedChildren.length;
		return !numChild ? 0 :
			this.branch.closedChildren.length / numChild;
	}

	//子チケット情報取得
	this.GetChildren = function () {
		return this.currentPath ? this.branch.children : [];
	}
	this.GetClosedChildren = function () {
		return this.currentPath ?  this.branch.closedChildren : [];
	}

	//branchの読み込み
	this.LoadBranch = function () {
		if (!this.currentPath) {
			return;
		}
		const log = this.Do([
			'log',
			'--oneline',
			'--no-decorate',
			'--first-parent',
			'--no-abbrev-commit']);
		if (!log) {
			return; //failed
		}
		const branch = this.Do(['branch']);
		if (!branch) {
			return;
		}
		this.branch = new Branch(log, branch);
	}

	//子チケット追加
	this.NewChild = async function () {

		let options = {
			prompt: "Title: ",
			placeHolder: "(title the new issue)"
		}

		vscode.window.showInputBox(options).then((value) => {
			if (!value) {
				return;
			}
			value.trim();
			if (!value.length) {
				return;
			}

			this.CommitMessage(`.dits new ${value}`);

			//ブランチ再読込
			vscode.commands.executeCommand('dits.refresh');
		});
	}

	this.OpenChild = async function (ticket) {
		const branchName = `#${ticket.hash}`;
		const reopen = 0 <= this.branch.branches.indexOf(branchName);
		const command = !reopen ?
			['checkout', '-b', branchName] :
			['checkout', branchName];

		if (this.Do(command)) {
			if (!reopen) {
				this.CommitMessage(`.dits open ${ticket.label}`);
				this.CommitMessage(`.dits super ${this.branch.branch}`);

				vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: 'syncing remote',
					cancellable: false
				}, (progress, token) => {
					progress.report({ increment: 0 });

					const p = new Promise((resolve, reject) => {
						if (this.isRemotes && !this.Do(['push', '--set-upstream', 'origin', branchName], true)) {
							vscode.window.showWarningMessage(`Issue ${ticket.label} is already exsits.`);
							this.Do(['checkout', this.branch.branch]);
							this.Do(['branch', '-D', branchName]);
							this.Do(['fetch']);
							this.Do(['branch', branchName, `origin/${branchName}`]);
						}
						progress.report({ increment: 100 });
						resolve();
						vscode.commands.executeCommand('dits.refresh');
					});
					return p;
				})
			}
			vscode.commands.executeCommand('dits.refresh');
		}
	}

	this.Finish = function() {
		if (this.branch.parent) {
			if (this.Do(['checkout', this.branch.parent]) &&
				this.Do(['merge', '--no-ff', this.branch.branch]) &&
				this.Do(['branch', '-D', this.branch.branch]) && (
					!this.isRemotes ||
					this.Do(['push', 'origin', `:${this.branch.branch}`]))) {
				vscode.commands.executeCommand('dits.refresh');
			} else {
				vscode.window.showErrorMessage(
					'Failed some operations. Try manually.');
			}
		} else {
			vscode.window.showErrorMessage(
				'The super issue has not specified. Try manually.');
		}
	}

	this.GoParent = async function () {
		if (this.branch.parent) {
			if (this.Do(['checkout', this.branch.parent])) {
				vscode.commands.executeCommand('dits.refresh');
			}
		} else {
			vscode.window.showErrorMessage(
				'The super issue has not specified. Try manually.');
		}
	}

	this.Delete = async function () {
		if (this.branch.children.length) {
			vscode.window.showErrorMessage(
				'There are subIssues. First, Delete or finish them.');
			return;
		}
		const choice = await vscode.window.showInformationMessage(
			`delete ${this.branch.currentTitle}?`, 'yes', 'no');
		if (choice === 'yes') {
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Deleting issue',
				cancellable: false
			}, (progress, token) => {
				const p = new Promise((resolve, reject) => {
					progress.report({ increment: 0 });
					if (this.Do(['checkout', this.branch.parent])) {
						this.CommitMessage(`.dits delete ${this.branch.branch}`);
						this.Do(['branch', '-D', this.branch.branch]);
						if (this.isRemotes) {
							this.Do([
								'push',
								'origin',
								`:${this.branch.branch}`]);
						}
						vscode.commands.executeCommand('dits.refresh');
					}
					progress.report({ increment: 100 });
					resolve();
				});
				return p;
			});
		}
	}

	this.DeleteSub = async function (v) {
		if (!v.notOpened) {
			vscode.window.showErrorMessage(
				`Issue ${v.label} is opened already. First, Open it.`);
			return;
		}
		const choice = await vscode.window.showInformationMessage(
			`delete ${v.label}?`, 'yes', 'no');
		if (choice === 'yes') {
			this.CommitMessage(`.dits delete #${v.hash}`);
			vscode.commands.executeCommand('dits.refresh');
		}
	}

	this.Chdir = async function (path) {
		if (path) {
			this.currentPath = path;
			this.LoadBranch();
			vscode.commands.executeCommand('dits.refresh');
		}
	}

	this.Release = function () {
		if (!this.currentPath) {
			return;
		}
		rev = this.branch.lastRevision;
		if (rev) {
			revs = rev.split('.');
			revs[2] = parseInt(revs[2]) + 1;
			rev = `${revs[0]}.${revs[1]}.${revs[2]}`;
		} else {
			rev = '0.0.0';
		}

		let options = {
			prompt: "Revision: ",
			placeHolder: "(revision to release)",
			value: rev
		}

		vscode.window.showInputBox(options).then((value) => {
			if (!value) {
				return;
			}
			value.trim();
			if (!value.length) {
				return;
			}

			commitMessage = `.dits release ${value}`;
			this.CommitMessage(commitMessage);
			vscode.commands.executeCommand('dits.refresh');

			var note = '# Release note\n\n';
			var r = null;
			this.branch.closedChildren.forEach(e => {
				if (r != e.revision) {
					r = e.revision;
					note += `## ${r}\n`;
				}
				note += `* ${e.label}\n`;
			});
			fs.writeFileSync(`${this.currentPath}/RELEASE.md`, note, 'utf8');
			this.Do(['add', 'RELEASE.md']);
			this.Do(['commit', '--amend', `-m ${commitMessage}`]);

			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Generating release tag...',
				cancellable: false
			}, (progress, token) => {
				const p = new Promise((resolve, reject) => {
					progress.report({ increment: 0 });
					this.Do(['tag', value]);
					this.Do(['push', '--tags']);
					progress.report({ increment: 100 });
					resolve();
				});
				return p;
			});
		});
	}

	//リモートの有無を確認
	this.isRemotes = 0 < this.Do(['remote']).split('\n').length;

	//最初の状態を読み込む
	this.LoadBranch();

};


class WorkspaceProvider {
	constructor() {
		this.list = [];
		if (vscode.workspace.workspaceFolders) {
			vscode.workspace.workspaceFolders.forEach(element => {
				this.list.push({
					label: element.name,
					path: element.uri.fsPath,
					command: {
						command: 'dits.chdir',
						arguments: [ element.uri.fsPath ]
					}
				});
			});
		}
	}
	getTreeItem(v) {
		return v;
	}
	getChildren(v) {
		return this.list;
	}
}
