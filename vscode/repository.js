

const vscode = require('vscode');
const child_process = require('child_process');
const fs = require("fs");



class Commit{
	hash;
	message;
	constructor(hash, message) {
		this.hash = hash;
		this.message = message;
	};
};

class Commits {
	#commits = [];
	constructor(commitArray) {
		this.#commits = commitArray;
	}
	Add(commit) {
		this.#commits.push(commit);
	}
	FerEach(f) {
		this.#commits.forEach(f);
	}
};

class BranchInfo {
	current;
	list = [];
	Add(name) {
		this.list.push(name);
	}
	AddCurrent(name) {
		this.list.push(name);
		this.current = name;
	}
};

//Gitアクセス
class Git {
	#path;
	constructor(workingPath) {
		this.#path = workingPath;
	}

	//Git呼び出し
	Do(args, supressError = false) {
		if (!this.#path) {
			return;
		}
		var out = child_process.spawnSync(
			'git', args, { cwd: this.#path });
		if (out.status) {
			if (!supressError) {
				vscode.window.showErrorMessage(out.stderr.toString());
			}
			return;
		}
		return out.output.toString().slice(1, -1);
	};

	//メッセージだけの空コミット
	CommitEmpty(message) {
		this.Do(['commit', '--allow-empty', '-m', message]);
	};

	//現ブランチのログを取得
	GetLog() {
		//ログ取得(フルサイズ、一行)
		const log = this.Do([
			'log',
			'--oneline',
			'--no-decorate',
			'--first-parent',
			'--no-abbrev-commit']);
		if (!log) {
			return; //failed
		}

		//パースしてCommitへ変換
		commits = new Commits;
		for (var item of log.split('\n')) {
			if (item.length) {
				const tokens = item.split(' ');
				const hashLen = tokens[0].length;

				commits.Add(new Commit(tokens[0], item.slice(hashLen).trim()));
			}
		}

		return commits;
	};

	//ブランチ情報取得
	GetBranchInfo() {
		const b = this.Do(['branch']);
		if (!b) {
			return; //failed
		}

		bi = new BranchInfo;
		for (let item of b.split('\n')) {
			const i = item.trim().split(' ');
			if (item[0] === '*') {
				bi.AddCurrent(item[1].trim());
			} else {
				bi.Add(item[0].trin());
			}
		}

		return bi;
	}
};



//issue関連
class Issue {
	//後方互換性設定
	#backwordCompatible =
		vscode.workspace.getConfiguration('dits').get('backwordCompatible');

	//dits管理外commit
	log;
	//現issue
	currentTitle;
	openHash;
	lastRevision;
	//状態別issueリスト
	supeer;
	sub;
	closed;
	deleted;

	//ditsコマンドの解釈
	#IsMatch(s, l) {
		return this.backwordCompatible ?
			longHash.indexOf(shortHash) == 0 :
			shortHash == longHash;
	}

	#NewSubIssue(c, cargs) {
		const label = c.message.slice(10);
		const h = `#${commit.hash}`;
		if (!this.deleted.find(
			e => this.backwordCompatible ?
				h.indexOf(e) == 0 :
				e == h)) {
			const ce = this.closed.find(
				e => this.backwordCompatible ?
					commit.hash.indexOf(e.hash) == 0 :
					e.hash == h);
			if (!ce) {
				if (this.branches.indexOf(h) < 0) {
					//ブランチがないので新規フラグ
					commit.notOpened = true;
				}
				this.children.push(commit);
			} else {
				//エントリにラベルを追加
				ce.label = commit.label;
			}
		}
	}

	#Super(c, cargs) {
		const pLabel =
			c.message.slice(
				cargs[0].length +
				cargs[1].length +
				cargs[2].length + 3);
		if (!this.super) {
			this.super = {
				branch: cargs[2],
				label: pLabel ? pLabel : cargs[2]
			}
		}
	}

	constructor(commits, branchInfo) {
		commits.ForEach(c => {
			//コミットメッセージをパース
			const cargs = c.message.split(' ');
			switch (cargs[0]) {
				case '.dits':
					//ditsコマンド
					switch (cargs[1]) {
						case 'open':
							//ブランチの始まり=解析終了(終了する関係で例外的に)
							if (!this.currentTitle) {
								this.currentTitle = c.message.slice(11);
								this.openHash = c.hash;
							}
							return;
						case 'new': //新規服課題
							this.#NewSubIssue(c, cargs);
							break;
						case 'delete': //削除済み副課題
							this.deleted.push(cargs[2]);
							break;
						case 'title': //課題タイトル
							if (!this.currentTitle) {
								this.currentTitle = c.message.slice(12);
							}
							break;
						case 'release': //リリース情報
							this.revision = cargs[2];
							if (!this.lastRevision) {
								this.lastRevision = this.revision;
							}
							break;
						case 'parent': //超課題の設定(旧)
							if (!this.#backwordCompatible) {
								vscode.window.showErrorMessage(
									'Command "parent" is no longer used. Enable "Recognize short hash and branchname without #" to enable it.');
							}
							break;
						case 'super': //超課題の設定
							this.#Super(c, cargs);
							break;
						default:
							vscode.window.showErrorMessage(
								`Unrecognized dits command: ${c.message}`);
							break;
					}
					break;
				case 'Merge': //merge=closed
					this.closedIssue.push({
						hash: cargs[2].slice(
							this.backwordCompatible ?
								cargs[2][1] == '#' ? 2 : 1 : 1, -1),
						revision: this.revision
					});
					break;
				default: //コマンドではないコミットのコメントはただのコメント
					this.log.push(c);
					break;
			}
		});

		//closedからラベルがない(=dits管理外)要素を除去
		var newClosed = [];
		this.closed.forEach(e => {
			if (e.label) {
				newClosed.push(e);
			}
		});
		this.closed = newClosed;

		if (!this.currentTitle) {
			//カレントISSUEのタイトルがないときはブランチ名を設定しておく
			this.currentTitle = this.branch;
		}

	}
};




exports.DitsRepository = function () {
}


























class Branch{
	constructor(log, branch) {
		this.items = [];
		this.children = [];
		this.closed = [];
		this.deleted = [];
		this.branches = [];
		this.backwordCompatible =
			vscode.workspace.getConfiguration('dits').get('backwordCompatible');

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

		//closedからラベルがない要素を除去
		var newClosed = [];
		this.closed.forEach(e => {
			if (e.label) {
				newClosed.push(e);
			}
		});
		this.closed = newClosed;

		if (!this.currentTitle) {
			//カレントISSUEのタイトルがないときはブランチ名を設定しておく
			this.currentTitle = this.branch;
		}
	}
	ParseBranch = function (b) {
		for (let item of b.split('\n')) {
			item = item.trim().split(' ');
			if (item[0] == '*') {
				//現課題のブランチ名を取得
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
				//ditsコマンド
				switch (cargs[1]) {
					case 'new': //新規副課題
						commit.label = commit.label.slice(10);
						const h = `#${commit.hash}`;
						if (!this.deleted.find(
							e => this.backwordCompatible ?
								h.indexOf(e) == 0 :
								e == h)) {
							const ce = this.closed.find(
								e => this.backwordCompatible ?
									commit.hash.indexOf(e.hash) == 0 :
									e.hash == h);
							if (!ce) {
								if (this.branches.indexOf(h) < 0) {
									//ブランチがないので新規フラグ
									commit.notOpened = true;
								}
								this.children.push(commit);
							} else {
								//エントリにラベルを追加
								ce.label = commit.label;
							}
						}
						break;
					case 'open': //ブランチの始まり=解析終了
						if (!this.currentTitle) {
							this.currentTitle = commit.label.slice(11);
							this.openHash = commit.hash;
						}
						return false;
					case 'delete': //削除済み副課題
						this.deleted.push(cargs[2]);
						break;
					case 'parent': //超課題の設定
					case 'super':
						const pLabel =
							commit.label.slice(
							cargs[0].length +
							cargs[1].length +
							cargs[2].length + 3);
						if (!this.parent) {
							this.parent = {
								branch: cargs[2],
								label: pLabel ? pLabel : cargs[2]
							}
						}
						break;
					case 'title': //課題タイトル
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
					hash: cargs[2].slice(
						this.backwordCompatible ?
							cargs[2][1] == '#' ? 2 : 1 : 1, -1),
					revision: this.revision
				});
				break;
			default: //コマンドではないコミットのコメントはただのコメント
				this.items.push(commit);
				break;
		}
		return true;
	}
};




exports.Repository = function () {
	//ワークディレクトリのパスを取得
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

	//課題情報取得
	this.GetIssueInfo = function () {
		if (!this.currentPath) {
			return null;
		}

		//オーナー情報収集
		owner = null;
		if (this.branch.openHash) {
			owner = this.Do([
				'log',
				'--no-walk',
				'--pretty=short',
				this.branch.openHash]).split('\n')[1].slice(8);
		}

		//進捗率を計算して課題情報をまとめて返る
		let numChild =
			this.branch.children.length +
			this.branch.closed.length;
		return {
			issue: this.branch.currentTitle,
			parent: this.branch.parent ? this.branch.parent.label : null,
			progress: !numChild ? 0 :
				this.branch.closed.length / numChild,
			owner: owner
		};
	}

	//課題情報一覧を取得
	this.GetBranch = function () {
		return this.currentPath ? this.branch.items : [];
	}

	//副課題情報取得
	this.GetChildren = function () {
		return this.currentPath ? this.branch.children : [];
	}
	this.GetClosedChildren = function () {
		return this.currentPath ?  this.branch.closed : [];
	}

	//Gitのログを取得して現課題オブジェクトを生成
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

	//副課題追加
	this.NewChild = async function () {

		//入力欄情報
		let options = {
			prompt: "Title: ",
			placeHolder: "(title the new issue)"
		}

		//入力欄生成
		vscode.window.showInputBox(options).then((value) => {
			if (!value) {
				//キャンセル
				return;
			}
			value.trim();
			if (!value.length) {
				//入力なし
				return;
			}

			//コマンド生成
			this.CommitMessage(`.dits new ${value}`);

			//ブランチ再読込
			vscode.commands.executeCommand('dits.refresh');
		});
	}

	//副課題を開く
	this.OpenChild = async function (ticket) {
		const branchName = `#${ticket.hash}`;
		const reopen = 0 <= this.branch.branches.indexOf(branchName);
		const command = !reopen ?
			['checkout', '-b', branchName] :
			['checkout', branchName];

		if (this.Do(command)) {
			if (!reopen) {
				this.CommitMessage(`.dits open ${ticket.label}`);
				this.CommitMessage(
					'.dits super ' +
					this.branch.branch + ' ' +
					this.branch.currentTitle);

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
		if (this.branch.children.length) {
			vscode.window.showErrorMessage(
				'There are subIssues. First, Delete or Finish them.');
			return;
		}
		if (this.branch.parent) {
			if (this.Do(['checkout', this.branch.parent.branch]) &&
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
			if (this.Do(['checkout', this.branch.parent.branch])) {
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
				'There are subIssues. First, Delete or Finish them.');
			return;
		}
		if (!this.branch.parent) {
			vscode.window.showErrorMessage(`$(branch.branch) isn\'t an issue.`);
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
					if (this.Do(['checkout', this.branch.parent.branch])) {
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
			this.branch.closed.forEach(e => {
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
