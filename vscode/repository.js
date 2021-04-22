

const vscode = require('vscode');
const child_process = require('child_process');
const fs = require("fs");


//後方互換性設定
var backwordCompatible = false;


//ハッシュ／ブランチ比較
function IsSame(a, b) {
	return backwordCompatible ?
		a.length < b.length ? !b.indexOf(a) : !a.indexOf(b) : a === b;
};


//コミット
class Commit{
	hash;
	message;
	constructor(hash, message) {
		this.hash = hash;
		this.message = message;
	};
};

//コミットのリスト
class Commits {
	#list;
	constructor() {
		this.#list = [];
	}
	GetList() {
		return this.#list;
	}
	Add(commit) {
		this.#list.push(commit);
	}
	ForEach(f) {
		this.#list.find(f);
	}
	GetLength() {
		return this.#list.length;
	}
	FindByBranchName(name) {
		return this.#list.find(i => name == `#${i.hash}`);
	}
};

//ブランチ情報
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
	IsIn(name) {
		return this.list.find(e => IsSame(name, e));
	}
};

//Gitアクセス
class Git {
	#path;
	#isRemote;
	constructor(workingPath) {
		this.#path = workingPath;

		//リモートの有無を確認
		this.#isRemote = 0 < this.Do(['remote']).split('\n').length;
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
	DoR(args, supressError = false) {
		if (this.#isRemote) {
			return this.Do(args, supressError);
		}
	}

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
		const commits = new Commits();
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
		const b = this.Do(['branch']).trim();;
		if (!b) {
			return; //failed
		}

		var bi = new BranchInfo;
		for (let item of b.split('\n')) {
			const i = item.trim().split(' ');
			if (i[0] === '*') {
				bi.AddCurrent(i[1].trim());
			} else {
				bi.Add(i[0].trim());
			}
		}

		return bi;
	}
};



//issue関連
class Issue {
	#branchInfo;
	//dits管理外commit
	log = [];
	//現issue
	currentTitle;
	currentBranch;
	lastRevision;
	ownerCommit;
	//状態別issueリスト
	super;
	sub = new Commits;
	closed = [];
	deleted = [];

	//ditsコマンドの解釈
	#NewSubIssue(c, cargs) {
		const label = c.message.slice(10);
		const h = `#${c.hash}`;
		if (!this.deleted.find(e => IsSame(e, h))) {
			//deletedにないので存在するsubIssue
			const ce = this.closed.find(e => IsSame(e.hash, c.hash));
			if (!ce) {
				//closedにないので生きているsubIssue
				if (this.#branchInfo.list.indexOf(h) < 0) {
					//ブランチがないのでコミットに新規フラグを追加する
					c.notOpened = true;
				}
				//表示用データ追加
				c.label = label;
				//subIssueリストに追加
				this.sub.Add(c);
			} else {
				//closedなのでエントリにラベルを追加
				ce.label = c.message.slice(10);
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

	#SetOwner(commit) {
		if (!this.ownerCommit) {
			this.ownerCommit = commit.hash;
		}
	}

	#Finish(cargs) {
		this.closed.push({
			hash: cargs[2].replace(/(\'|#)/g, ''),
			revision: this.revision
		});
	}

	constructor(commits, branchInfo) {
		//設定の読み込み
		backwordCompatible =
			vscode.workspace.getConfiguration('dits').get('backwordCompatible');

		this.#branchInfo = branchInfo;
		this.currentBranch = branchInfo.current;
		commits.ForEach(c => {
			//コミットメッセージをパース
			const cargs = c.message.split(' ');
			switch (cargs[0]) {
				case '.dits':
					//ditsコマンド
					switch (cargs[1]) {
						case 'open':
							if (!this.currentTitle) {
								this.currentTitle = c.message.slice(11);
							};
							this.#SetOwner(c);
							return true;
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
							if (!backwordCompatible) {
								vscode.window.showErrorMessage(
									'Command "parent" is no longer used. Enable "Recognize short hash and branchname without #" to enable it.');
								break;
							}
						case 'super': //超課題の設定
							this.#Super(c, cargs);
							break;
						case 'finish': //課題完了
							this.#Finish(cargs);
							break;
						default:
							vscode.window.showErrorMessage(
								`Unrecognized dits command: ${c.message}`);
							break;
					}
					break;
				case 'Merge': //merge=finish
					if (backwordCompatible) {
						this.#Finish(cargs);
					}
					break;
				default: //コマンドではないコミットのコメントはただのコメント
					c.label = c.message;
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
			this.currentTitle = this.currentBranch = branchInfo.current;
		}
	}
};




exports.DitsRepository = function () {
	/////インターフェイス
	this.LoadBranch = function () { //ブランチの読み込み
		if (!this.currentPath) {
			return;
		}
		this.git = new Git(this.currentPath);
		this.issue = new Issue(this.git.GetLog(), this.git.GetBranchInfo());
	}
	this.Release = function () { //リリース
		if (!this.currentPath) {
			return;
		}

		//仮リビジョン計算
		rev = this.issue.lastRevision;
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
			this.git.CommitEmpty(commitMessage);
			vscode.commands.executeCommand('dits.refresh');

			var note = '# Release note\n\n';
			var r = null;
			this.issue.closed.forEach(e => {
				if (r != e.revision) {
					r = e.revision;
					note += `## ${r}\n`;
				}
				note += `* ${e.label}\n`;
			});
			fs.writeFileSync(`${this.currentPath}/RELEASE.md`, note, 'utf8');
			this.git.Do(['add', 'RELEASE.md']);
			this.git.Do(['commit', '--amend', `-m ${commitMessage}`]);

			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Generating release tag...',
				cancellable: false
			}, (progress, token) => {
				const p = new Promise((resolve, reject) => {
					progress.report({ increment: 0 });
					this.git.Do(['tag', value]);
					this.git.DoR(['push', '--tags']);
					progress.report({ increment: 100 });
					resolve();
				});
				return p;
			});
		});
	}
	this.NewChild = async function () { //副課題追加
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
			this.git.CommitEmpty(`.dits new ${value}`);

			//ブランチ再読込
			vscode.commands.executeCommand('dits.refresh');
		});
	}
	this.OpenChild = async function (ticket) { //副課題を開く
		const branchName = `#${ticket.hash}`;
		const reopen = this.git.GetBranchInfo().IsIn(branchName);
		const command = !reopen ?
			['checkout', '-b', branchName] :
			['checkout', branchName];

		if (this.git.Do(command)) {
			if (!reopen) {
				this.git.CommitEmpty(`.dits open ${ticket.label}`);
				this.git.CommitEmpty(
					'.dits super ' +
					this.issue.currentBranch + ' ' +
					this.issue.currentTitle);

				vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: 'syncing remote',
					cancellable: false
				}, (progress, token) => {
					progress.report({ increment: 0 });

					const p = new Promise((resolve, reject) => {
						if (!this.git.DoR([
							'push',
							'--set-upstream',
							'origin',
							branchName],
							true)) {
							vscode.window.showWarningMessage(
								`Issue ${ticket.label} is already exsits.`);
							this.git.Do([
								'checkout',
								this.issue.currentBranch]);
							this.git.Do([
								'branch',
								'-D',
								branchName]);
							this.git.DoR(['fetch']);
							this.git.DoR([
								'branch',
								branchName,
								`origin/${branchName}`]);
						}
						progress.report({ increment: 100 });
						resolve();
						vscode.commands.executeCommand('dits.refresh');
					});
					return p;
				})
			}
		}
		vscode.commands.executeCommand('dits.refresh');
	}
	this.Finish = function () {
		if (this.issue.sub.GetLength()) {
			vscode.window.showErrorMessage(
				'There are subIssues. First, Delete or Finish them.');
			return;
		}
		if (this.issue.super) {
			if (this.git.Do(['checkout', this.issue.super.branch]) &&
				this.git.Do([
					'merge',
					'--no-ff',
					'-m',
					`.dits finish ${this.issue.currentBranch}`,
					this.issue.currentBranch]) &&
				this.git.Do(['branch', '-D', this.issue.currentBranch]) &&
				this.git.DoR([
					'push', 'origin', `:${this.issue.currentBranch}`])) {
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
	this.GoParent = function () {
		if (this.issue.super) {
			if (this.git.Do(['checkout', this.issue.super.branch])) {
				vscode.commands.executeCommand('dits.refresh');
			}
		} else {
			vscode.window.showErrorMessage(
				'The super issue has not specified. Try manually.');
		}
	}
	this.Delete = async function () {
		if (this.issue.sub.GetLength()) {
			vscode.window.showErrorMessage(
				'There are subIssues. First, Delete or Finish them.');
			return;
		}
		if (!this.issue.super) {
			vscode.window.showErrorMessage(
				`${this.issue.currentTitle} might not an issue.`);
			return;
		}
		const choice = await vscode.window.showInformationMessage(
			`delete ${this.issue.currentTitle}?`, 'yes', 'no');
		if (choice === 'yes') {
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Deleting issue',
				cancellable: false
			}, (progress, token) => {
				const p = new Promise((resolve, reject) => {
					progress.report({ increment: 0 });
					if (this.git.Do(['checkout', this.issue.super.branch])) {
						this.git.CommitEmpty(
							`.dits delete ${this.issue.currentBranch}`);
						this.git.Do(['branch', '-D', this.issue.currentBranch]);
						this.git.DoR([
							'push',
							'origin',
							`:${this.issue.currentBranch}`]);
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
			this.git.CommitEmpty(`.dits delete #${v.hash}`);
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


	this.InputAndDo = function (ToDo, title, placeHalder) {
		let options = { prompt: title, placeHolder: placeHalder };

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

			ToDo(value);

			//ブランチ再読込
			vscode.commands.executeCommand('dits.refresh');
		});
	}
	this.Commit = function () {
		this.InputAndDo(v => {
			this.git.CommitEmpty(v);
		});
	}
	this.CommitAll = function () {
		this.InputAndDo(v => {
			this.git.Do(['commit', '-a', '-m', v]);
		});
	}


	/////アクセサ
	this.GetSub = function () {
		return this.issue.sub.GetList();
	}
	this.GetLog = function () {
		return this.issue.log;
	}
	this.GetIssueInfo = function () {
		//owner取得
		owner = null;
		if (this.issue.ownerCommit) {
			owner = this.git.Do([
				'log',
				'--no-walk',
				'--pretty=short',
				this.issue.ownerCommit]).split('\n')[1].slice(8);
		}

		//データ生成
		return {
			title: this.issue.currentTitle,
			progress: {
				open: this.issue.sub.GetLength(),
				closed: this.issue.closed.length
			},
			owner: owner,
			super: this.issue.super
		};
	}
	this.GetClosedSub = function () {
		return this.issue.closed;
	}


	/////初期化

	//ワークディレクトリのパスを取得
	if (vscode.workspace.workspaceFolders) {
		this.currentPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
	}

	//workspacesにTreeViewを設定
	vscode.window.createTreeView('workspaces', {
		treeDataProvider: new WorkspaceProvider()
	});

	//Issue読み込み
	this.LoadBranch();
}

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
						arguments: [element.uri.fsPath]
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
