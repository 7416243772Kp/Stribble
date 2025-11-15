// src/controllers/courseController.js
import Course from "../models/course.js";

// @desc Get all courses (public)
// @desc Get all courses (public) -- defensive
export const getCourses = async (req, res) => {
  try {
    const courses = await Course.find().lean();
    // remove googleDriveLink from every course
    const sanitized = courses.map(c => {
      if (c.googleDriveLink) delete c.googleDriveLink;
      return c;
    });
    return res.json(sanitized);
  } catch (error) {
    console.error("getCourses error:", error);
    return res.status(500).json({ message: "Error fetching courses" });
  }
};


// @desc Get single course by ID (public)
// @desc Get single course by ID (public) -- defensive, always removes googleDriveLink
export const getCourseById = async (req, res) => {
  try {
    // fetch the course (get full doc just in case)
    const courseDoc = await Course.findById(req.params.id).lean();
    if (!courseDoc) return res.status(404).json({ message: "Course not found" });

    // forcefully remove the sensitive field
    if (courseDoc.googleDriveLink) delete courseDoc.googleDriveLink;

    return res.json(courseDoc);
  } catch (error) {
    console.error("getCourseById error:", error);
    return res.status(500).json({ message: "Error fetching course" });
  }
};


// @desc Create a new course (admin)
export const createCourse = async (req, res) => {
  try {
    const { title, price, thumbnail, description, googleDriveLink } = req.body;

    if (!googleDriveLink) {
      return res.status(400).json({ message: "Google Drive link is required" });
    }

    const newCourse = new Course({ title, price, thumbnail, description, googleDriveLink });
    await newCourse.save();
    res.status(201).json(newCourse);
  } catch (error) {
    console.error("createCourse error:", error);
    res.status(500).json({ message: "Error creating course" });
  }
};

// @desc Update a course (admin)
export const updateCourse = async (req, res) => {
  try {
    const updated = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: "Course not found" });
    res.json(updated);
  } catch (error) {
    console.error("updateCourse error:", error);
    res.status(500).json({ message: "Error updating course" });
  }
};

// @desc Delete a course (admin)
export const deleteCourse = async (req, res) => {
  try {
    const deleted = await Course.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Course not found" });
    res.json({ message: "Course deleted" });
  } catch (error) {
    console.error("deleteCourse error:", error);
    res.status(500).json({ message: "Error deleting course" });
  }
};
