// 山东华宇工学院 拾光课程表适配脚本
// 基于正方教务系统个人课表页面HTML解析

/**
 * 解析周次字符串
 * 支持格式："1-15周"、"9-15周,18周"、"16周"
 */
function parseWeeks(weekStr) {
	var weeks = [];
	if (!weekStr) return weeks;
	
	var weekRanges = weekStr.split(',');
	for (var r = 0; r < weekRanges.length; r++) {
		var range = weekRanges[r].trim();
		var dashIdx = range.indexOf('-');
		if (dashIdx !== -1 && range.indexOf('周') !== -1) {
			var start = parseInt(range.substring(0, dashIdx));
			var endPart = range.substring(dashIdx + 1);
			var end = parseInt(endPart);
			if (!isNaN(start) && !isNaN(end)) {
				for (var w = start; w <= end; w++) {
					weeks.push(w);
				}
			}
		} else {
			var singleWeek = parseInt(range);
			if (!isNaN(singleWeek)) {
				weeks.push(singleWeek);
			}
		}
	}
	
	// 去重和排序
	var uniqueWeeks = [];
	for (var i = 0; i < weeks.length; i++) {
		if (uniqueWeeks.indexOf(weeks[i]) === -1) {
			uniqueWeeks.push(weeks[i]);
		}
	}
	uniqueWeeks.sort(function(a, b) { return a - b; });
	return uniqueWeeks;
}

/**
 * 解析节次字符串
 * 格式："1-2"
 */
function parseSections(sectionStr) {
	var parts = sectionStr.split('-');
	var start = parseInt(parts[0]);
	var end = parseInt(parts[parts.length - 1]);
	var sections = [];
	for (var s = start; s <= end; s++) {
		sections.push(s);
	}
	return sections;
}

/**
 * 解析HTML页面中的课程数据
 */
function parseHtmlData(html) {
	console.log('JS: 开始解析HTML课表数据...');
	var results = [];
	var parser = new DOMParser();
	var doc = parser.parseFromString(html, 'text/html');
	var courses = doc.getElementsByClassName('timetable_con');
	console.log('JS: 找到 ' + courses.length + ' 个课程节点');
	
	for (var i = 0; i < courses.length; i++) {
		var courseDiv = courses[i];
		var parentTd = courseDiv.parentElement;
		var tdId = parentTd.id;
		if (!tdId) continue;
		
		var day = parseInt(tdId.split('-')[0]);
		if (isNaN(day)) continue;
		
		var titleSpan = courseDiv.getElementsByClassName('title')[0];
		var courseName = titleSpan.textContent.trim();
		courseName = courseName.split('★').join('');
		courseName = courseName.split('●').join('');
		courseName = courseName.split('◆').join('');
		courseName = courseName.split('◇').join('');
		courseName = courseName.split('○').join('');
		
		var paras = courseDiv.getElementsByTagName('p');
		var teacher = '';
		var position = '';
		var timeStr = '';
		
		for (var j = 0; j < paras.length; j++) {
			var p = paras[j];
			var spans = p.getElementsByTagName('span');
			for (var k = 0; k < spans.length; k++) {
				var span = spans[k];
				var tooltipTitle = span.getAttribute('title');
				if (tooltipTitle === '节/周') {
					timeStr = p.textContent.trim();
				} else if (tooltipTitle === '上课地点') {
					position = p.textContent.trim();
				} else if (tooltipTitle === '教师 ') {
					teacher = p.textContent.trim();
				}
			}
		}
		
		if (!timeStr) continue;
		
		// timeStr格式: "(1-2节)1-15周"
		var sectionStartIdx = timeStr.indexOf('(');
		var sectionEndIdx = timeStr.indexOf('节');
		if (sectionStartIdx === -1 || sectionEndIdx === -1) continue;
		
		var sectionPart = timeStr.substring(sectionStartIdx + 1, sectionEndIdx);
		var sections = parseSections(sectionPart);
		
		var weekPart = timeStr.substring(timeStr.indexOf(')') + 1).replace('周', '');
		var weeks = parseWeeks(weekPart);
		
		if (weeks.length === 0) continue;
		
		results.push({
			name: courseName,
			position: position,
			teacher: teacher,
			weeks: weeks,
			day: day,
			sections: sections
		});
	}
	
	console.log('JS: HTML解析完成，共找到 ' + results.length + ' 门课程');
	return results;
}

/**
 * 获取页面HTML内容
 */
async function scheduleHtmlProvider() {
	return document.body.innerHTML;
}

/**
 * 显示开始确认弹窗
 */
async function promptUserToStart() {
	console.log('JS: 显示导入确认弹窗');
	return await window.AndroidBridgePromise.showAlert(
		'教务系统课表导入',
		'请确保当前已登录正方教务系统。接下来将选择学年和学期。',
		'好的，开始导入'
	);
}

/**
 * 验证学年输入
 */
function validateYearInput(input) {
	console.log('JS: validateYearInput 被调用，输入: ' + input);
	if (/^[0-9]{4}$/.test(input)) {
		console.log('JS: validateYearInput 验证通过');
		return false;
	} else {
		console.log('JS: validateYearInput 验证失败');
		return '请输入四位数字的学年！';
	}
}

/**
 * 获取学年输入
 */
async function getAcademicYear() {
	var currentYear = new Date().getFullYear().toString();
	console.log('JS: 提示用户输入学年');
	return await window.AndroidBridgePromise.showPrompt(
		'选择学年',
		'请输入要导入课程的起始学年（如2025-2026应填2025）：',
		currentYear,
		'validateYearInput'
	);
}

/**
 * 选择学期
 */
async function selectSemester() {
	var semesters = ['第一学期', '第二学期'];
	console.log('JS: 提示用户选择学期');
	var semesterIndex = await window.AndroidBridgePromise.showSingleSelection(
		'选择学期',
		JSON.stringify(semesters),
		0
	);
	return semesterIndex;
}

/**
 * 将选择索引转换为API学期码
 */
function getSemesterCode(semesterIndex) {
	return semesterIndex === 0 ? '3' : '12';
}

/**
 * 检查并切换学年学期
 */
async function switchToCorrectSemester(year, semesterIndex) {
	var semesterCode = getSemesterCode(semesterIndex);
	var xnmSelect = document.getElementById('xnm');
	var xqmSelect = document.getElementById('xqm');
	
	if (!xnmSelect || !xqmSelect) {
		console.log('JS: 未找到学年学期选择器，跳过切换');
		return true;
	}
	
	var currentXnm = xnmSelect.value;
	var currentXqm = xqmSelect.value;
	
	if (currentXnm === year && currentXqm === semesterCode) {
		console.log('JS: 当前页面已经是目标学年学期');
		return true;
	}
	
	console.log('JS: 自动切换学年学期到 ' + year + '-' + (parseInt(year) + 1) + ' 第' + (semesterIndex + 1) + '学期');
	xnmSelect.value = year;
	xqmSelect.value = semesterCode;
	
	var event = document.createEvent('HTMLEvents');
	event.initEvent('change', true, true);
	xnmSelect.dispatchEvent(event);
	xqmSelect.dispatchEvent(event);
	
	var searchBtn = document.getElementById('search_go');
	if (searchBtn) {
		searchBtn.click();
		console.log('JS: 已触发查询，等待页面更新...');
		return new Promise(function(resolve) {
			setTimeout(function() {
				resolve(true);
			}, 2000);
		});
	}
	
	return false;
}

/**
 * 获取并解析课程数据
 */
async function fetchAndParseCourses(academicYear, semesterIndex) {
	AndroidBridge.showToast('正在解析课表数据...');
	console.log('JS: 开始获取页面HTML并解析，学年: ' + academicYear + '，学期索引: ' + semesterIndex);
	
	try {
		var switchResult = await switchToCorrectSemester(academicYear, semesterIndex);
		if (!switchResult) {
			AndroidBridge.showToast('自动切换学年学期失败，请手动选择后重试');
			return null;
		}
		
		var providerRes = await scheduleHtmlProvider();
		if (!providerRes) {
			AndroidBridge.showToast('获取页面内容失败，请检查网络。');
			console.log('JS: 获取页面HTML失败');
			return null;
		}
		
		var parserRes = parseHtmlData(providerRes);
		if (!parserRes || parserRes.length === 0) {
			AndroidBridge.showToast('未解析到课程，请确认当前在课表页面且课程已加载。');
			console.log('JS: 未解析到任何课程');
			return null;
		}
		
		var courses = [];
		for (var i = 0; i < parserRes.length; i++) {
			var item = parserRes[i];
			var secs = item.sections;
			courses.push({
				name: item.name,
				teacher: item.teacher,
				position: item.position,
				day: item.day,
				startSection: secs[0],
				endSection: secs[secs.length - 1],
				weeks: item.weeks
			});
		}
		
		var config = {
			semesterTotalWeeks: 20,
			firstDayOfWeek: 1
		};
		
		console.log('JS: 课程数据处理完成，共 ' + courses.length + ' 门');
		return { courses: courses, config: config };
	} catch (error) {
		AndroidBridge.showToast('解析失败: ' + error.message);
		console.error('JS: Parse Error:', error);
		return null;
	}
}

/**
 * 保存课程数据
 */
async function saveCourses(parsedCourses) {
	AndroidBridge.showToast('正在保存 ' + parsedCourses.length + ' 门课程...');
	console.log('JS: 尝试保存 ' + parsedCourses.length + ' 门课程');
	try {
		await window.AndroidBridgePromise.saveImportedCourses(JSON.stringify(parsedCourses));
		console.log('JS: 课程保存成功');
		return true;
	} catch (error) {
		AndroidBridge.showToast('课程保存失败: ' + error.message);
		console.error('JS: Save Courses Error:', error);
		return false;
	}
}

/**
 * 保存课表配置
 */
async function saveConfig(config) {
	console.log('JS: 尝试保存课表配置');
	try {
		await window.AndroidBridgePromise.saveCourseConfig(JSON.stringify(config));
		AndroidBridge.showToast('课表配置更新成功！总周数：' + config.semesterTotalWeeks + '周');
		console.log('JS: 配置保存成功');
		return true;
	} catch (error) {
		AndroidBridge.showToast('课表配置保存失败: ' + error.message);
		console.error('JS: Save Config Error:', error);
		return false;
	}
}

// 山东华宇工学院西区夏季作息时间
var TimeSlots = [
			{section: 1, startTime: '08:10', endTime: '08:55'},
			{section: 2, startTime: '09:05', endTime: '09:50'},
			{section: 3, startTime: '10:15', endTime: '11:00'},
			{section: 4, startTime: '11:15', endTime: '12:00'},
			{section: 5, startTime: '14:40', endTime: '15:25'},
			{section: 6, startTime: '15:35', endTime: '16:20'},
			{section: 7, startTime: '16:30', endTime: '17:15'},
			{section: 8, startTime: '17:25', endTime: '18:10'},
			{section: 9, startTime: '19:10', endTime: '19:55'},
			{section: 10, startTime: '20:05', endTime: '20:50'}
];

/**
 * 导入预设时间段
 */
async function importPresetTimeSlots() {
	console.log('JS: 准备导入 ' + TimeSlots.length + ' 个预设时间段');
	try {
		await window.AndroidBridgePromise.savePresetTimeSlots(JSON.stringify(TimeSlots));
		AndroidBridge.showToast('预设时间段导入成功！');
		console.log('JS: 时间段导入成功');
		return true;
	} catch (error) {
		AndroidBridge.showToast('导入时间段失败: ' + error.message);
		console.error('JS: Save Time Slots Error:', error);
		return false;
	}
}

/**
 * 编排整个导入流程
 */
async function runImportFlow() {
	console.log('JS: ===== 山东华宇工学院课表导入流程开始 =====');
	
	var alertConfirmed = await promptUserToStart();
	if (!alertConfirmed) {
		AndroidBridge.showToast('用户取消了导入。');
		console.log('JS: 用户取消了导入流程');
		return;
	}
	
	var academicYear = await getAcademicYear();
	if (academicYear === null) {
		AndroidBridge.showToast('导入已取消。');
		console.log('JS: 获取学年失败/取消，流程终止');
		return;
	}
	console.log('JS: 已选择学年: ' + academicYear);
	
	var semesterIndex = await selectSemester();
	if (semesterIndex === null || semesterIndex === -1) {
		AndroidBridge.showToast('导入已取消。');
		console.log('JS: 选择学期失败/取消，流程终止');
		return;
	}
	console.log('JS: 已选择学期索引: ' + semesterIndex);
	
	var result = await fetchAndParseCourses(academicYear, semesterIndex);
	if (result === null) {
		console.log('JS: 课程获取或解析失败，流程终止');
		return;
	}
	var courses = result.courses;
	var config = result.config;
	
	var saveResult = await saveCourses(courses);
	if (!saveResult) {
		console.log('JS: 课程保存失败，流程终止');
		return;
	}
	
	var configResult = await saveConfig(config);
	if (!configResult) {
		console.log('JS: 配置保存失败，流程终止');
		return;
	}
	
	await importPresetTimeSlots();
	
	AndroidBridge.showToast('课程导入成功，共导入 ' + courses.length + ' 门课程！');
	console.log('JS: ===== 整个导入流程执行完毕并成功 =====');
	AndroidBridge.notifyTaskCompletion();
}

runImportFlow();