import * as vscode from "vscode";
import * as path from "path";
import { Uri } from "vscode";
// import * as util from "util";
// import * as inspector from "inspector";
// import { strict } from "assert";

type TimeLineData = {
	[key: string]: {
		workTime: number;
		freeTime: number;
		keyCount: number;
		date: number;
		language: string;
	};
};

type FileData = {
	// file name -> time -> {data}
	[key: string]: TimeLineData;
};

// array with all edited files
let files: { [key: string]: FileData } = {};

function getCurrentDate (date: Date = new Date()) {
	let options = {
		year: "numeric",
		month: "numeric",
		day: "numeric",
		timezone: "UTC"
	};

	return date.toLocaleDateString("en", options);
}

// status bar element in editor
let statusBarItem: vscode.StatusBarItem;

// is the editor in focus
let isWindowFocused = true;

// time during which time outside the editor is considered as working time (after all, it can be searching for information in the browser or tests)
let outsideWorkTimeCount = 240,
	outsideWorkTime = outsideWorkTimeCount,
	isTypedKeyCount = 5, // how many keys must be pressed to consider that a person has begun to work
	isTyped = isTypedKeyCount, // how many keys must be pressed to consider that a person has begun to work
	isFreeTime = false; // stops work timer, this is entertainment

// if a person does not write anything for a long time, then we believe that he is resting
let pauseInCodingCount = 180,
	pauseInCoding = pauseInCodingCount;

// extention started now - don't increase free time
let extStart = true;

// return name of opened file
function getCurrentFile () {
	if (!vscode.window.activeTextEditor) {
		return "";
	}
	return vscode.window.activeTextEditor.document.uri.toString().replace(/^.*[\\\/]/, "");
}

function getLanguage () {
	return path.extname(getCurrentFile()).slice(1); // html;
}
function setLanguage () {
	files[getProjectName()][getCurrentFile()][getCurrentDate()].language = getLanguage(); // html;
}

function getProjectName () {
	return vscode.workspace.name ? vscode.workspace.name : "xxxproject";
}

function setClearData () {
	if (getCurrentFile() === "") {
		return;
	}
	if (!files[getProjectName()]) {
		files[getProjectName()] = {};
		setClearData();
	} else if (!files[getProjectName()][getCurrentFile()]) {
		files[getProjectName()][getCurrentFile()] = {};
		setClearData();
	} else if (!files[getProjectName()][getCurrentFile()][getCurrentDate()]) {
		files[getProjectName()][getCurrentFile()][getCurrentDate()] = {
			workTime: 0,
			freeTime: 0,
			date: 0,
			keyCount: 0,
			language: getLanguage()
		};
	}
}

function fillFiledates () {
	let file = files[getProjectName()][getCurrentFile()]; // current file data
	let missingFilesCount = 30 - Object.keys(Object.assign({}, file)).length; // missing dates in statistics
	// data for more than a month
	if (missingFilesCount < 0) {
		let arr = Object.keys(file);
		delete file[arr[0]]; // delete first element(the latest date)
	}

	// fill array elements to get month data
	// 30 - 12 = 18 days
	for (let day = 1; day < missingFilesCount; day++) {
		let copiedDate = new Date(Date.parse(Object.keys(file)[0]));
		let filedate = getCurrentDate(new Date(copiedDate.setDate(copiedDate.getDate() - day)));
		if (!file[filedate]) {
			file[filedate] = {
				workTime: 0,
				freeTime: 0,
				date: 0,
				keyCount: 0,
				language: getLanguage()
			};
		}
	}

	// get order of dates
	let dates = Object.keys(file);
	dates.sort((a: string, b: string) => {
		return Date.parse(b) - Date.parse(a);
	});

	let copyFile: TimeLineData = {};

	// sort file data by date
	dates.map((date: string) => {
		copyFile[date] = file[date];
	});
	files[getProjectName()][getCurrentFile()] = copyFile;
}

export async function activate (context: vscode.ExtensionContext) {
	// vscode.workspace.fs.readFile(Uri.file(path.join(context.extensionPath, "chartTest.html")));
	let disposable = vscode.commands.registerCommand(
		"productivity-checker.productivity-check",
		async () => {
			if (!vscode.window.activeTextEditor) {
				vscode.window.showInformationMessage(
					"Откройте какую-нибудь папку и запустите чекер еще раз"
				);
			} else {
				extStart = true; // don't increase free time
			}
		}
	);
	context.subscriptions.push(disposable);

	let out = "start"; // output message

	// get data
	if (!context.globalState.get("filesData")) {
		context.globalState.update("filesData", {});
	}
	if (
		!context.globalState.get("productivity-checker-settings") ||
		!(context.globalState.get("productivity-checker-settings") as { cWork: number }).cWork
	) {
		// standart settings
		context.globalState.update("productivity-checker-settings", {
			cWork: 3.27,
			cKey: 5,
			cFree: 4.8,
			statusBarType: "openedFile",
			statusBarItem: "workTime"
		});
	}

	let contextFiles: { [key: string]: FileData } | undefined = context.globalState.get(
		"filesData"
	);

	files = contextFiles ? contextFiles : {};

	if (!vscode.window.activeTextEditor) {
		return false;
	}

	setClearData(); // if data of this file is not defined, set it

	// funciton for open page with all data about productivity
	let showWebViewPanel = vscode.commands.registerCommand(
		"productivity-checker.showProductivityInformation",
		async () => {
			const currentPanel = vscode.window.createWebviewPanel(
				"productivityTracker",
				"Productivity Tracker",
				vscode.ViewColumn.One,
				{
					enableScripts: true,
					localResourceRoots: [
						vscode.Uri.file(path.join(context.extensionPath, "media"))
					]
				}
			);

			function webView () {
				currentPanel.webview.html = setupWebview(
					context,
					currentPanel,
					getProjectName(),
					getCurrentFile()
				);
			}
			webView();

			// Handle messages from the webview
			currentPanel.webview.onDidReceiveMessage(
				message => {
					// delete files data
					if (message.clearFilesData) {
						// console.log("delete!!!");
						context.globalState.update("filesData", {});
					}
					context.globalState.update("productivity-checker-settings", message.settings);

					return;
					// webView(); // update with new settings
				},
				undefined,
				context.subscriptions
			);
		}
	);

	if (vscode.window.activeTextEditor) {
		// create status bar
		statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10);
		statusBarItem.command = "productivity-checker.showProductivityInformation"; // set onclick function
		updateStatusBar(context);

		// on change active file
		vscode.window.onDidChangeActiveTextEditor(() => {
			// save data about new file
			setClearData();

			// update data in status bar
			updateStatusBar(context);

			if (isTyped === 0) {
				pauseInCoding = pauseInCodingCount;
			}
		});

		// onClick
		vscode.window.onDidChangeTextEditorSelection(() => {
			// User is working yet
			if (isTyped === 0) {
				pauseInCoding = pauseInCodingCount;
			}
		});

		// onScroll
		vscode.window.onDidChangeTextEditorVisibleRanges(() => {
			// User is working yet. He is scrolling the document and maybe think
			if (isTyped === 0) {
				pauseInCoding = pauseInCodingCount;
			} else {
				isTyped = 3; // needs to type paar keys
			}
		});

		// on typing, increase the number of clicks
		vscode.workspace.onDidChangeTextDocument(() => {
			files[getProjectName()][getCurrentFile()][getCurrentDate()].keyCount++;

			// User is working yet
			if (isTyped === 0) {
				pauseInCoding = pauseInCodingCount;

				if (extStart) {
					extStart = false;
				}
			} else {
				isTyped--;
			}
		});

		function tic () {
			if (extStart) {
				return;
			} // don't increase free time.

			let projectName = getProjectName();
			let fileName = getCurrentFile();
			let date = getCurrentDate();

			if (fileName === "") {
				return;
			}

			// window is focused
			if (isWindowFocused) {
				// user does not write anything for a long time
				if (pauseInCoding === 0) {
					files[projectName][fileName][date].freeTime++; // it is free time
					isTyped = 5; // user must press 5 key to start timer
					return false;
				} else {
					pauseInCoding--;
				}

				// person just open vscode, he doesn't work!!!
				if (isTyped !== 0) {
					return false;
				}

				// work in other apps is ended
				isFreeTime = false;
				outsideWorkTime = outsideWorkTimeCount;

				files[projectName][fileName][date].workTime++; // increse work time
			} else {
				// --- window is not fucused --- //

				// work in other applications for 5 minutes is considered work
				if (outsideWorkTime !== 0 && !isFreeTime) {
					// needs to type something
					if (isTyped !== 0) {
						return false;
					}
					files[projectName][fileName][date].workTime++; // user don't work, incease free time
					outsideWorkTime--; // time for work in other apps

					if (outsideWorkTime === 0) {
						isFreeTime = true; // stop decreasing infoSearchingTime
					}
				} else {
					// too much time spent in other apps - maybe take a break from work??
					files[projectName][fileName][date].freeTime++;
					// key count for begin work
					isTyped = 5;
				}
			}

			context.globalState.update("filesData", files); // save data
			updateStatusBar(context); // update status bar
		}
		tic();

		// increase time
		setInterval(tic, 1000);
	}

	// vscode.window.showInformationMessage(out ? out : "lox");

	context.subscriptions.push(showWebViewPanel);
}

// this method is called when your extension is deactivated
export function deactivate () {}

const convertTime = (totalSeconds: number) => {
	totalSeconds = Number(totalSeconds);
	let h = Math.floor(totalSeconds / 3600);
	let m = Math.floor((totalSeconds % 3600) / 60);
	let s = Math.floor((totalSeconds % 3600) % 60);

	let hDisplay = h > 0 ? h + ":" : "";
	let mDisplay = m > 0 ? (m < 10 ? "0" + m + ":" : m + ":") : "00:";
	let sDisplay = s > 9 ? s : "0" + s;
	return hDisplay + mDisplay + sDisplay;
};

vscode.window.onDidChangeWindowState(e => {
	isWindowFocused = e.focused;
});

function updateStatusBar (context: vscode.ExtensionContext) {
	// get settings
	let settings = context.globalState.get("productivity-checker-settings") as {
		statusBarType: string;
		statusBarItem: string;
	};

	// variables to show in status var
	let today = getCurrentDate();
	let currentFile = files[getProjectName()][getCurrentFile()][today];
	let workTime = 0,
		keyCount = 0,
		freeTime = 0,
		totalTime = 0;

	// show statistics for all files
	if (settings.statusBarType === "allFiles") {
		// get all data for today
		Object.values(files).forEach(project => {
			Object.values(project).forEach(file => {
				if (!file[today]) {
					return false;
				}
				// get today data of all files
				workTime += file[today].workTime;
				keyCount += file[today].keyCount;
				freeTime += file[today].freeTime;
				totalTime += file[today].freeTime + file[today].workTime;
			});
		});
	} else if (settings.statusBarType === "openedFile") {
		// get today data of opened file
		workTime = currentFile.workTime | 0;
		keyCount = currentFile.keyCount | 0;
		freeTime = currentFile.freeTime | 0;
		totalTime = freeTime + workTime;

		statusBarItem.text = `$(clock) Work time: ${convertTime(workTime)}`; // update text
		statusBarItem.tooltip = `Время работы с файлом ${getCurrentFile()}`; // change file name in desc
	}

	if (settings.statusBarItem === "workTime") {
		statusBarItem.text = `$(clock) Work time: ${workTime}`; // update text
		statusBarItem.tooltip = `Время работы сегодня`; // change file name in desc
	} else if (settings.statusBarItem === "freeTime") {
		statusBarItem.text = `$(clock) Free time: ${freeTime}`; // update text
		statusBarItem.tooltip = `Время отдыха сегодня`; // change file name in desc
	} else if (settings.statusBarItem === "totalTime") {
		statusBarItem.text = `$(clock) Total time: ${totalTime}`; // update text
		statusBarItem.tooltip = `Общее время`; // change file name in desc
	} else if (settings.statusBarItem === "keyCount") {
		statusBarItem.text = `$(clock) Key count: ${keyCount}`; // update text
		statusBarItem.tooltip = `Кол-во нажатий`; // change file name in desc
	}

	statusBarItem.show();
}
function setupWebview (
	context: vscode.ExtensionContext,
	panel: vscode.WebviewPanel,
	currentProject: string,
	currentFile: string
) {
	// return
	return `<!DOCTYPE html>
	<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Будь еще продуктивней</title>
			<script src="
				${panel.webview.asWebviewUri(
					vscode.Uri.file(path.join(context.extensionPath, "media", "chart.js"))
				)}">
			</script>

			<style>
				body, html{
					padding: 0 100px;
					oveflow-x: hidden;
				}
				@media screen and (max-width: 1300px) {
					body, html {
						padding: 0 15px;
					}
					.info {
						padding: 0 20px !important;
					}
				}
				ol{
					list-style: none;
					padding: 10px;
				}
				button {
					background: rgb(74, 74, 74);
					border: none;
					padding: 7px;
					margin: 5px;
					border-radius: 5px;
				}
				button:hover {
					transform: scale(1.02, 1.02);
				}
				#filesListContainer ul{
					display: flex;
					justify-content: space-evenly ;
				}
					
				#tabs{
					width: 100%;
					height: max-content;
					margin-bottom: 10px;
					position: relative;
				}
				#tabs span {
					padding: 7px;
					border-radius: 0 0 5px 5px;
					background: rgb(74, 74, 74);
					border: none;
					transition: all .05s ease-in-out;
					cursor: pointer;
				}
				#tabs span.active {
					background: rgb(90, 90, 90);
					padding-top: 7px;
					padding: 8px;
				}
				#tabs span:hover {
					padding: 8px;
					padding-top: 7px;
					background: rgb(78, 78, 78);
				}
				#tabs #settings{
					position: absolute;
					top: -7px;
					right: 0;
				}


				.info{
					width: 100%;
					padding: 0 130px;
					margin: 45px 0;
				}
				.info-text{
					font-size: 1.2em;
				}

				.info-text #info-work-time{
					color: #24AEF3;
				}
				.info-text #info-key-count{
					color: #22c76c;
				}
				.info-text #info-free-time{
					color: #F0652A;
				}
				.info-text #info-language{
					color: #b522ab;
				}
				.info-text #info-salary{
					color: #e6e861;
				}

				#settingsWindow{
					position: fixed;
					opacity: 0;
					transition: all .5s ease-in-out; 
					top: 0;
					left: 0;
					width: 100%;
					min-height: 100%;
					background: #242424;
					color: white;
					display: flex;
					justify-content: center;
					pointer-events: none;
				}
				#settingsWindow.settings-active{
					opacity: 1;
					z-index: 1000;
					pointer-events: all;
				}
				#settingsWindow .settingsWindow-wrapper{
					width: 100%;
					margin: 0 100px;
					margin-top: 20px;
				}
				#settingsWindow .settingsWindow-wrapper * {
					width: 100%;
					font-size: 1.1em
				}
				#settingsWindow .settingsWindow-wrapper h1 {
					display: flex;
					justify-content: center;
					font-size: 1.45em
				}
				#settingsWindow .settingsWindow-wrapper #hSalary {
					width: 120px !important;
					background: #4a4a4a;
					border-radius: 5px;
					color: white;
					border: none;
					outline: none;
					padding: 5px;
				}
				#settingsWindow .settingsWindow-wrapper input {
					border: none;
					outline: none;
				}
				.settingTitle{
					font-size: 1.23em;
					font-weight: bold;
				}

				#settingsWindow #settingsClose{
					position: absolute;
					right: 0;
					transform: rotate(45deg);
					z-index: 1001;
				}

				#settingsWindow .settingsWindow-wrapper input[type="radio"] {
					width: 50px;
					margin-left: 25px;
				}



			</style>
		</head>
		<body>
			<h1 align="center">Статистика продуктивности</h1>

			<div id="settingsWindow">
				<div class="settingsWindow-wrapper">
					<span id="settingsClose">+</span>

					<h1>Настройки productivity-trecker</h1>

					<p id="getHourSalary">
						<span class="settingTitle">Сколько вы берете за час своей работы?</span>
						<input min="0" max="10000" type="number" id="hSalary" data-obj="cWork">
					</p>

					<p id="getStatusBarItem">
						<span class="settingTitle">Показывать в статус баре:</span></br>
						<input name="statusBarItem" type="radio" data-obj="statusBar-item" value="workTime"> время работы</br>
						<input name="statusBarItem" type="radio" data-obj="statusBar-item" value="keyCount"> кол-во нажатий</br>
						<input name="statusBarItem" type="radio" data-obj="statusBar-item" value="freeTime"> время отдыха</br>
						<input name="statusBarItem" type="radio" data-obj="statusBar-item" value="totalTime"> общее время
					</p>

					<p id="getStatusBarType">
						<span class="settingTitle">Статистика в статус баре:</span></br>
						<input name="statusBarType" type="radio" data-obj="statusBar-type" value="openedFile"> только для открытого файла</br>
						<input name="statusBarType" type="radio" data-obj="statusBar-type" value="allFiles"> для всех файлов</br>
					</p>

					<p>
						<span class="settingTitle">Очистить все данные всех файлов</span>
						<input type="radio" id="clearFilesData" data-obj="clearFilesData">
					</p>

					<button id="settingsSave">Сохранить</button>
				</div>
			</div>

			<div class="info">
				<h2>Общая статистика за месяц</h2>
				<div class="info-text">
					Вы работали <b><span id="info-work-time"></span></b>. <br>
					Сделали <b><span id="info-key-count"></span></b> нажатий. <br>
					Отдыхали <b><span id="info-free-time"></span></b>. <br>
					Ваш любимый язык в этом месяце - <b><span id="info-language"></span></b>. <br>
					И ваша зарплата в этом месяце - <b><span id="info-salary"></span></b>.
				</div>
			</div>

			<h2 id="currentFile" align="center"></h2>

			<hr>
			<h3>Выберите график: </h3>
			<div id="tabs">
				<span class="active" id="time">Время</span>
				<span id="key">Кол-во клавиш</span>
				<span id="cash">Заработок</span>
				<span id="settings">Настройки</span>
			</div>
	
			<canvas id="key-chart"></canvas>
	
			<p>
				<h2>Выберите файл: </h2>
				<div id="filesListContainer"></div>
			</p>
			<script>
				let filesData = JSON.parse(\`${JSON.stringify(context.globalState.get("filesData"))}\`);

				let currentProject = JSON.parse(\`${JSON.stringify(currentProject)}\`);
				let currentFile = JSON.parse(\`${JSON.stringify(currentFile)}\`);

				function updayeFileName(currentFile = "${currentFile}") {
					document.querySelector('#currentFile').innerHTML = currentFile;
				}
				updayeFileName();

				let viewData = {}; // data for chart
				let labelsData = []; // data for labels of chart

				function getCurrentDate (date = new Date()) {
					let options = {
						year: "numeric",
						month: "numeric",
						day: "numeric",
						timezone: "UTC"
					};
	
					return date.toLocaleDateString("en", options);
				}
				
				// coefficients, data for get cash value
				let coefficients = JSON.parse(\`${JSON.stringify(
					context.globalState.get("productivity-checker-settings")
				)}\`);
				
				let c_work = coefficients.cWork,
					c_key  = coefficients.cKey,
					c_free = coefficients.cFree;

				function getFileData (project, filename) {
					labelsData = [];
					viewData = {
						workTime: [],
						freeTime: [],
						totalTime: [],
						keyCount: [],
						cash: []
					};
	
					// pull chart data
					for (let day = 0; day < 30; day++) {
						// get current date as string
						let date_str = new Date(getCurrentDate());
						// get dates for month as string
						let date = getCurrentDate(new Date(date_str.setDate(date_str.getDate() - day)));
	
						let currentFile = filesData[project][filename][date];
	
						// data is not defined - set empty data
						if (!currentFile) {
							viewData['workTime'].push(0);
							viewData['freeTime'].push(0);
							viewData['totalTime'].push(0);
							viewData['keyCount'].push(0);
							viewData['cash'].push(0);
						} else {
							// work data
							let work_time  = currentFile.workTime,
								free_time  = currentFile.freeTime,
								total_time = work_time + free_time,
								key_count  = currentFile.keyCount,
								cash       = 0;

							// for a more accurate result
							if (work_time > 360) {
								cash = Math.round(( work_time / c_work ) + ( (key_count * 100 * c_key) / work_time ) - ( free_time / c_free ));
							} else {
								cash = 0;
							}

							currentFile.cash = cash;

							viewData['workTime'].push(work_time);
							viewData['freeTime'].push(free_time);
							viewData['totalTime'].push(total_time);
							viewData['keyCount'].push(key_count);
							viewData['cash'].push(cash);

							filesData[project][filename][date] = currentFile;
						}

						// add date to labels
						labelsData.push(date);
					}
				}
	
				getFileData(
					currentProject,
					currentFile
				);

				let ctx = document.getElementById('key-chart').getContext('2d');
				// crerate chart
				let statistics = new Chart(ctx, {
					type: 'line',
					data: {
						labels: labelsData, // date
						datasets: [
							{
								label: 'Время работы',
								borderColor: '#24AEF3',
								fill: false,
								data: viewData['workTime']
							},
							{
								label: 'Время отдыха',
								backgroundColor: '#F0652B',
								borderColor: '#F0652A',
								fill: false,
								data: viewData['freeTime']
							},
							{
								label: 'Общее время',
								backgroundColor: '#313640',
								fill: true,
								data: viewData['totalTime']
							},
						]
					},
					options: {
						aspectRatio: 2.4,
						hover: {
							// Overrides the global setting
							mode: 'index'
						},
						legend: {
							display: true
						},
						scales: {
							xAxes: [ {
								type: "time",
								time: {
									unit: 'month'
								},
								display: true,
								scaleLabel: {
									display: true,
									labelString: 'Данные за месяц'
								}
							} ],
							yAxes: [ {
								display: true,
								scaleLabel: {
									display: true,
									labelString: 'Время, с'
								}
							} ]
						}
					}
				});

				let filesContainer = document.getElementById('filesListContainer');

				// pull files for create tree list in html
				let files = {}

				Object.keys(filesData).forEach (project => {
					files[project] = Object.keys(filesData[project]).map(file => {
						return file;
					});
				});

				filesContainer.appendChild(objToHtmlList(files));

				function getKeyByValue(object, value) {
					return Object.keys(object).find(key => object[key] === value);
				}

				function objToHtmlList(obj, projectName = "utitled") {
					if (obj instanceof Array) {
						let ol = document.createElement('ol');
						for (let child in obj) {
							if (!obj[child]) continue; // sckip untitled files
							let li = document.createElement('li');
							
							// button for open file
							let btn = document.createElement("BUTTON");
							btn.onclick = () => {
								openFileData(projectName, obj[child]);
							}
							btn.appendChild(objToHtmlList(obj[child]));
							li.appendChild(btn);
							ol.appendChild(li);
						}
						return ol;
					}
					else if (obj instanceof Object && !(obj instanceof String)) {
						let ul = document.createElement('ul');
						for (let child in obj) {
							let li = document.createElement('li');
							li.appendChild(document.createTextNode(child + ": "));
							li.appendChild(objToHtmlList(obj[child], child));
							ul.appendChild(li);
						}
						return ul;
					}
					else {
						return document.createTextNode(obj);
					}
				}

				function openFileData (project, fileName, type = "time") {
					print_tabs(); // clear tabs

					// save current file and project
					currentProject = project;
					currentFile = fileName;

					getFileData(project, fileName); // get data to display

					updayeFileName(fileName); // update file name in header

					if (type == "time"){
						statistics.data.datasets = [
							{
								label: 'Время работы',
								borderColor: '#24AEF3',
								fill: false,
								data: viewData['workTime']
							},
							{
								label: 'Время отдыха',
								backgroundColor: '#F0652B',
								borderColor: '#F0652A',
								fill: false,
								data: viewData['freeTime']
							},
							{
								label: 'Общее время',
								backgroundColor: '#313640',
								fill: true,
								data: viewData['totalTime']
							},
						];
					} else if (type == "key") {
						statistics.data.datasets = [
							{
								label: 'Количество нажатых клавиш',
								borderColor: '#22c76c',
								fill: false,
								data: viewData['keyCount']
							}
						];
					} else if (type == "cash") {
						statistics.data.datasets = [
							{
								label: 'Ваш заработок',
								borderColor: '#e6e861',
								fill: false,
								data: viewData['cash']
							}
						];
					}
	
					statistics.update();
				}
	
				// -----html work----- //
				print_tabs();
				function print_tabs() {
					let tabs = document.querySelectorAll('#tabs span');
					tabs.forEach(tab => {
						tab.classList.remove('active'); // clear active class for all
						tab.onclick = () => {
							if (tab.id !== 'settings') {
								// open new chart
								openFileData(currentProject, currentFile, tab.id)
							} else {
								// open settings page
								openSettings();
							}
							tabs.forEach(tab => {tab.classList.remove('active');}); // delete active class for all
							tab.classList.add('active'); // add class active
						};
					});
					tabs[0].classList.add('active'); // first tab is active
				}

				print_totalStatistics();
				function print_totalStatistics() {
					let info_work_time = 0,
					    info_key_count = 0,
						info_free_time = 0;
						info_salary    = 0;
					let languages = {},
						info_language = 'Русский;)';
					for (let project of Object.values(filesData)) {
						for (let file of Object.values(project)) {
							for (let day of Object.values(file)) {
								// work data
								let work_time  = day.workTime,
									free_time  = day.freeTime,
									key_count  = day.keyCount,
									cash       = 0;

								// for a more accurate result
								if (work_time > 360) {
									cash = Math.round(( work_time / c_work ) + ( (key_count * 100 * c_key) / work_time ) - ( free_time / c_free ));
								} else {
									cash = 0;
								}

								info_work_time += day.workTime;
								info_key_count += key_count;
								info_free_time += free_time;
								info_salary    += cash;

	
								if (!languages[day.language]) {
									languages[day.language] = 0;
								}
								languages[day.language] += day.workTime;
							}
						}
					}
	
					let bigest;
					for ( let lang in languages ) {
						if (!bigest) bigest = lang;
						else if (languages[bigest] < languages[lang])
							bigest = lang;
					}
					info_language = bigest;
	
					document.querySelector('#info-work-time').innerHTML = Math.floor(info_work_time/60) + ' мин';
					document.querySelector('#info-key-count').innerHTML = info_key_count;
					document.querySelector('#info-free-time').innerHTML = Math.floor(info_free_time/60) + ' мин';
					document.querySelector('#info-language').innerHTML  = info_language;
					document.querySelector('#info-salary').innerHTML    = info_salary + 'руб';
				}
				
				function openSettings () {
					// open / close settings
					document.querySelector('#settingsWindow').classList.toggle('settings-active');
	
					// get prev. settings
					let message = {
						settings: JSON.parse(\`${JSON.stringify(
							context.globalState.get("productivity-checker-settings")
						)}\`)
					};

					/// ----- UPDATE SETTINGS BY VALUES ----- ///

					// save settings on click button
					document.querySelector('#settingsSave').onclick = () => {
						// -----cWork from #hSalary----- //
						let hSalaryVal = document.querySelector('#hSalary').value;
						message.settings.cWork = hSalaryVal && hSalaryVal > 100 ? 3600 / (+hSalaryVal - 100) : 1200 - 100;

						// -----clear file data from #clearFilesData----- //
						message.clearFilesData = document.querySelector('#clearFilesData').checked;
					
						// -----status bar type (opened file or all files) from #getStatusBarType----- //
						let statusBarType_rad = document.querySelectorAll('#getStatusBarType input');
						statusBarType_rad.forEach(item => {
							if (item.checked) {
								message.settings.statusBarType = item.value;
							}
						});

						// -----status bar item (work time | free time | total time | key count) from #getStatusBarItem----- //
						let statusBarItem_rad = document.querySelectorAll('#getStatusBarItem input');
						statusBarItem_rad.forEach(item => {
							if (item.checked) {
								message.settings.statusBarItem = item.value;
							}
						});

						const vscode = acquireVsCodeApi();
						vscode.postMessage(message);
					}
				}
			</script>
		</body>
	</html>`;
}
