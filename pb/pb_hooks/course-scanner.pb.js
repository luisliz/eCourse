// pb/pb_hooks/course-scanner.pb.js

onAfterBootstrap(() => {
	// Register the scan courses endpoint
	routerAdd(
		"POST",
		"/api/scan-courses",
		(c) => {
			// Verify admin or auth user
			const admin = require("pocketbase/admin");
			if (!admin.authStore().isValid && !c.get("authRecord")) {
				return c.json(401, { success: false, message: "Unauthorized" });
			}

			return scanCourses(c);
		},
		null,
	);
});

function scanCourses(c) {
	const fs = require("fs");
	const path = require("path");
	const matter = require("gray-matter");

	const coursesDir = "/courses"; // Points to courses dir next to pb_data

	if (!fs.existsSync(coursesDir)) {
		return c.json(404, {
			success: false,
			message: "Courses directory not found",
		});
	}

	try {
		// Read all course directories
		const courseDirs = fs
			.readdirSync(coursesDir)
			.filter((dir) => fs.statSync(path.join(coursesDir, dir)).isDirectory());

		for (const courseDir of courseDirs) {
			const courseTitle = courseDir.replace(/_/g, " ");

			// Create/update course
			let course = new Record({
				title: courseTitle,
				assign_to_everyone: true,
			});

			try {
				course = $app
					.dao()
					.findFirstRecordByData("courses", "title", courseTitle);
			} catch {
				course = new Record(course);
				$app.dao().saveRecord(course);
			}

			// Process lessons
			const lessonDirs = fs
				.readdirSync(path.join(coursesDir, courseDir))
				.filter(
					(dir) =>
						dir.match(/^\d+_/) &&
						fs.statSync(path.join(coursesDir, courseDir, dir)).isDirectory(),
				);

			for (const lessonDir of lessonDirs) {
				const [orderStr, ...nameParts] = lessonDir.split("_");
				const lessonTitle = nameParts.join("_").replace(/_/g, " ");
				const lessonPath = path.join(coursesDir, courseDir, lessonDir);

				let lessonData = {
					course: course.id,
					title: lessonTitle,
					order: parseInt(orderStr),
				};

				// Process content.md
				const contentPath = path.join(lessonPath, "content.md");
				if (fs.existsSync(contentPath)) {
					const content = fs.readFileSync(contentPath, "utf8");
					const { data, content: mdContent } = matter(content);
					lessonData.content = mdContent;
					if (data.summary) {
						lessonData.summary = data.summary;
					}
				}

				// Process video files
				const videoFiles = fs
					.readdirSync(lessonPath)
					.filter((file) => file.endsWith(".mp4"));
				if (videoFiles.length > 0) {
					const videoPath = path.join(lessonPath, videoFiles[0]);
					const videoFile = createFile(videoPath, "video/mp4");
					lessonData.video = videoFile;
				}

				// Process PDF files
				const pdfFiles = fs
					.readdirSync(lessonPath)
					.filter((file) => file.endsWith(".pdf"));
				if (pdfFiles.length > 0) {
					lessonData.downloads = pdfFiles.map((pdf) =>
						createFile(path.join(lessonPath, pdf), "application/pdf"),
					);
				}

				// Create/update lesson
				let lesson;
				try {
					lesson = $app
						.dao()
						.findFirstRecordByData("lessons", "course,title", [
							course.id,
							lessonTitle,
						]);
					Object.assign(lesson, lessonData);
				} catch {
					lesson = new Record(lessonData);
				}
				$app.dao().saveRecord(lesson);
			}
		}

		return c.json(200, { success: true });
	} catch (error) {
		console.error("Scan error:", error);
		return c.json(500, { success: false, message: error.message });
	}
}

function createFile(filePath, contentType) {
	const fs = require("fs");
	const path = require("path");

	const fileData = fs.readFileSync(filePath);
	const fileName = path.basename(filePath);

	return {
		name: fileName,
		data: fileData,
		type: contentType,
	};
}
