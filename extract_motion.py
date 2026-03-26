"""
Motion Extractor for Sign Language Videos
"""

import cv2
import json
import mediapipe as mp
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Tuple


def convert_to_threejs_coords(landmark):
    """Convert MediaPipe coords to Three.js (negate Z)."""
    return (
        float(landmark.x),
        float(landmark.y),
        float(-landmark.z)
    )


class MotionExtractor:
    """Extracts motion data from sign language videos using MediaPipe."""
    
    # MediaPipe pose landmark indices
    LEFT_SHOULDER = 11
    RIGHT_SHOULDER = 12
    LEFT_ELBOW = 13
    RIGHT_ELBOW = 14
    LEFT_WRIST = 15
    RIGHT_WRIST = 16
    
    # Face landmark indices
    UPPER_LIP = 13
    LOWER_LIP = 14
    MOUTH_LEFT = 61
    MOUTH_RIGHT = 291
    LEFT_EYEBROW_INNER = 70
    LEFT_EYE_TOP = 159
    RIGHT_EYEBROW_INNER = 300
    RIGHT_EYE_TOP = 386
    
    def __init__(self, target_fps: int = 30, verbose: bool = True):
        self.target_fps = target_fps
        self.verbose = verbose
        self._init_landmarkers()
        
        # State tracking for occlusion fallbacks
        self.prev_left_landmarks = None
        self.prev_right_landmarks = None
        self.left_hand_missing_frames = 0
        self.right_hand_missing_frames = 0
        
        # TUNING PARAMETER: How long to hold a hand position if MediaPipe loses tracking
        self.max_missing_frames = 5  # ~160ms
    
    def _init_landmarkers(self):
        pose_model = self._download_model('pose')
        pose_options = mp.tasks.vision.PoseLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=pose_model),
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_segmentation_masks=False
        )
        self.pose_landmarker = mp.tasks.vision.PoseLandmarker.create_from_options(pose_options)
        
        hand_model = self._download_model('hand')
        hand_options = mp.tasks.vision.HandLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=hand_model),
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            num_hands=2,
            min_hand_detection_confidence=0.5,
            min_hand_presence_confidence=0.5,
            min_tracking_confidence=0.5
        )
        self.hand_landmarker = mp.tasks.vision.HandLandmarker.create_from_options(hand_options)
        
        face_model = self._download_model('face')
        face_options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=face_model),
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False
        )
        self.face_landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(face_options)
    
    def _download_model(self, model_type: str) -> str:
        import urllib.request
        model_urls = {
            'pose': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task',
            'hand': 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
            'face': 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'
        }
        model_names = {
            'pose': 'pose_landmarker_heavy.task',
            'hand': 'hand_landmarker.task',
            'face': 'face_landmarker.task'
        }
        model_path = Path.home() / ".mediapipe" / model_names[model_type]
        model_path.parent.mkdir(parents=True, exist_ok=True)
        if not model_path.exists():
            if self.verbose: print(f"📥 Downloading {model_type} model...")
            urllib.request.urlretrieve(model_urls[model_type], model_path)
        return str(model_path)
    
    def reset_landmarkers(self):
        self.pose_landmarker.close()
        self.hand_landmarker.close()
        self.face_landmarker.close()
        self._init_landmarkers()
    
    def load_video(self, video_path: str) -> Tuple[cv2.VideoCapture, int, float, float]:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened(): raise ValueError(f"Failed to open: {video_path}")
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        duration = total_frames / fps if fps > 0 else 0
        return cap, total_frames, duration, fps
    
    def resample_frames(self, cap: cv2.VideoCapture, total_frames: int, duration: float, orig_fps: float) -> List[Tuple[np.ndarray, int]]:
        target_frame_count = int(duration * self.target_fps)
        frame_indices = np.linspace(0, total_frames - 1, target_frame_count, dtype=int)
        frames = []
        current_idx = 0
        for target_idx in frame_indices:
            while current_idx <= target_idx:
                ret, frame = cap.read()
                if not ret: break
                if current_idx == target_idx:
                    timestamp_ms = int((len(frames) + 1) * (1000 / self.target_fps))
                    frames.append((frame, timestamp_ms))
                current_idx += 1
        cap.release()
        return frames
    
    def extract_body_data(self, pose_landmarks) -> Optional[Dict]:
        if not pose_landmarks: return None
        landmarks = pose_landmarks if isinstance(pose_landmarks, list) else pose_landmarks
        
        left_shoulder = convert_to_threejs_coords(landmarks[self.LEFT_SHOULDER])
        left_elbow = convert_to_threejs_coords(landmarks[self.LEFT_ELBOW])
        left_wrist = convert_to_threejs_coords(landmarks[self.LEFT_WRIST])
        right_shoulder = convert_to_threejs_coords(landmarks[self.RIGHT_SHOULDER])
        right_elbow = convert_to_threejs_coords(landmarks[self.RIGHT_ELBOW])
        right_wrist = convert_to_threejs_coords(landmarks[self.RIGHT_WRIST])
        
        def direction_to_quat(direction: np.ndarray) -> Dict[str, float]:
            eps = 1e-8
            dir_norm = np.linalg.norm(direction)
            if dir_norm < eps: return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
            direction = direction / dir_norm
            bone_forward = np.array([0.0, 1.0, 0.0])
            axis = np.cross(bone_forward, direction)
            axis_length = np.linalg.norm(axis)
            if axis_length < eps:
                dot = np.dot(bone_forward, direction)
                if dot > 0: return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
                else: return {"x": 1.0, "y": 0.0, "z": 0.0, "w": 0.0}
            axis = axis / axis_length
            dot = np.clip(np.dot(bone_forward, direction), -1.0, 1.0)
            angle = np.arccos(dot)
            half_angle = angle / 2.0
            sin_half = np.sin(half_angle)
            return {"x": float(axis[0] * sin_half), "y": float(axis[1] * sin_half), "z": float(axis[2] * sin_half), "w": float(np.cos(half_angle))}
        
        left_upper_dir = np.array([left_elbow[0] - left_shoulder[0], left_elbow[1] - left_shoulder[1], left_elbow[2] - left_shoulder[2]])
        left_lower_dir = np.array([left_wrist[0] - left_elbow[0], left_wrist[1] - left_elbow[1], left_wrist[2] - left_elbow[2]])
        right_upper_dir = np.array([right_elbow[0] - right_shoulder[0], right_elbow[1] - right_shoulder[1], right_elbow[2] - right_shoulder[2]])
        right_lower_dir = np.array([right_wrist[0] - right_elbow[0], right_wrist[1] - right_elbow[1], right_wrist[2] - right_elbow[2]])
        
        return {
            "left_shoulder": {"x": left_shoulder[0], "y": left_shoulder[1], "z": left_shoulder[2]},
            "left_elbow": {"x": left_elbow[0], "y": left_elbow[1], "z": left_elbow[2]},
            "left_wrist": {"x": left_wrist[0], "y": left_wrist[1], "z": left_wrist[2]},
            "right_shoulder": {"x": right_shoulder[0], "y": right_shoulder[1], "z": right_shoulder[2]},
            "right_elbow": {"x": right_elbow[0], "y": right_elbow[1], "z": right_elbow[2]},
            "right_wrist": {"x": right_wrist[0], "y": right_wrist[1], "z": right_wrist[2]},
            "left_shoulder_quat": direction_to_quat(left_upper_dir),
            "left_elbow_quat": direction_to_quat(left_lower_dir),
            "right_shoulder_quat": direction_to_quat(right_upper_dir),
            "right_elbow_quat": direction_to_quat(right_lower_dir),
        }

    def _matrix_to_quaternion(self, m: np.ndarray) -> Dict[str, float]:
        import numpy as np
        trace = m[0, 0] + m[1, 1] + m[2, 2]
        if trace > 0:
            s = 0.5 / np.sqrt(trace + 1.0)
            w = 0.25 / s
            x = (m[2, 1] - m[1, 2]) * s
            y = (m[0, 2] - m[2, 0]) * s
            z = (m[1, 0] - m[0, 1]) * s
        elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
            s = 2.0 * np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2])
            w = (m[2, 1] - m[1, 2]) / s
            x = 0.25 * s
            y = (m[0, 1] + m[1, 0]) / s
            z = (m[0, 2] + m[2, 0]) / s
        elif m[1, 1] > m[2, 2]:
            s = 2.0 * np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2])
            w = (m[0, 2] - m[2, 0]) / s
            x = (m[0, 1] + m[1, 0]) / s
            y = 0.25 * s
            z = (m[1, 2] + m[2, 1]) / s
        else:
            s = 2.0 * np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1])
            w = (m[1, 0] - m[0, 1]) / s
            x = (m[0, 2] + m[2, 0]) / s
            y = (m[1, 2] + m[2, 1]) / s
            z = 0.25 * s
        
        length = np.sqrt(x*x + y*y + z*z + w*w)
        if length < 1e-8: return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
        return {"x": float(x / length), "y": float(y / length), "z": float(z / length), "w": float(w / length)}

    def _calculate_wrist_orientation(self, landmarks: List[Dict], is_left: bool) -> Dict[str, float]:
        import numpy as np
        wrist = np.array([landmarks[0]['x'], landmarks[0]['y'], landmarks[0]['z']])
        index_mcp = np.array([landmarks[5]['x'], landmarks[5]['y'], landmarks[5]['z']])
        middle_mcp = np.array([landmarks[9]['x'], landmarks[9]['y'], landmarks[9]['z']])
        pinky_mcp = np.array([landmarks[17]['x'], landmarks[17]['y'], landmarks[17]['z']])
        ring_mcp = np.array([landmarks[13]['x'], landmarks[13]['y'], landmarks[13]['z']])
        
        palm_center = (index_mcp + middle_mcp + ring_mcp + pinky_mcp) / 4.0
        forward = palm_center - wrist
        forward_len = np.linalg.norm(forward)
        if forward_len < 1e-8: return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
        forward = forward / forward_len
        
        vec_to_index = index_mcp - wrist
        vec_to_pinky = pinky_mcp - wrist
        raw_normal = np.cross(vec_to_index, vec_to_pinky)
        normal_len = np.linalg.norm(raw_normal)
        if normal_len < 1e-8: return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
        raw_normal = raw_normal / normal_len
        
        palm_normal = -raw_normal if is_left else raw_normal
        palm_normal = palm_normal - np.dot(palm_normal, forward) * forward
        pn_len = np.linalg.norm(palm_normal)
        if pn_len < 1e-8: return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
        palm_normal = palm_normal / pn_len
        
        right = np.cross(forward, palm_normal)
        right_len = np.linalg.norm(right)
        if right_len < 1e-8: return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
        right = right / right_len
        
        rot_matrix = np.array([
            [right[0], forward[0], palm_normal[0]],
            [right[1], forward[1], palm_normal[1]],
            [right[2], forward[2], palm_normal[2]]
        ])
        
        if np.linalg.det(rot_matrix) < 0:
            rot_matrix[:, 0] = -rot_matrix[:, 0]
            
        return self._matrix_to_quaternion(rot_matrix)    

    def extract_face_data(self, face_landmarks) -> Optional[Dict]:
        if not face_landmarks: return None
        landmarks = face_landmarks if isinstance(face_landmarks, list) else face_landmarks
        def calc_distance(lm1, lm2, min_d: float, max_d: float) -> float:
            dist = np.sqrt((lm2.x - lm1.x)**2 + (lm2.y - lm1.y)**2 + (lm2.z - lm1.z)**2)
            if max_d - min_d < 1e-8: return 0.0
            return np.clip((dist - min_d) / (max_d - min_d), 0.0, 1.0)
        return {
            "jawOpen": calc_distance(landmarks[self.UPPER_LIP], landmarks[self.LOWER_LIP], 0.01, 0.08),
            "mouthSmile": calc_distance(landmarks[self.MOUTH_LEFT], landmarks[self.MOUTH_RIGHT], 0.05, 0.10),
            "eyeBrowRaise_L": calc_distance(landmarks[self.LEFT_EYE_TOP], landmarks[self.LEFT_EYEBROW_INNER], 0.03, 0.05),
            "eyeBrowRaise_R": calc_distance(landmarks[self.RIGHT_EYE_TOP], landmarks[self.RIGHT_EYEBROW_INNER], 0.03, 0.05)
        }

    def process_frame(self, frame: np.ndarray, frame_idx: int, timestamp_ms: int) -> Dict:
        """Process a single frame and handle occlusion fallbacks."""
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        
        pose_results = self.pose_landmarker.detect_for_video(mp_image, timestamp_ms)
        hand_results = self.hand_landmarker.detect_for_video(mp_image, timestamp_ms)
        face_results = self.face_landmarker.detect_for_video(mp_image, timestamp_ms)
        
        body_data = self.extract_body_data(pose_results.pose_world_landmarks[0]) if pose_results.pose_world_landmarks else None
        
        left_hand_data = None
        right_hand_data = None
        found_left = False
        found_right = False
        
        if hand_results.hand_landmarks and hand_results.hand_world_landmarks:
            for hand_world_lm, handedness in zip(hand_results.hand_world_landmarks, hand_results.handedness):
                hand_label = handedness[0].category_name.lower()
                
                # Extract RAW coordinates (flip Y/Z for Three.js format)
                current_landmarks = [{"x": float(lm.x), "y": float(-lm.y), "z": float(-lm.z)} for lm in hand_world_lm]
                
                if hand_label == 'left':
                    self.prev_left_landmarks = current_landmarks
                    self.left_hand_missing_frames = 0
                    found_left = True
                    left_hand_data = {"landmarks": current_landmarks, "wrist_quaternion": None} # Quat calculated after smoothing
                elif hand_label == 'right':
                    self.prev_right_landmarks = current_landmarks
                    self.right_hand_missing_frames = 0
                    found_right = True
                    right_hand_data = {"landmarks": current_landmarks, "wrist_quaternion": None}
        
        # Occlusion hold logic (if hand crosses behind arm)
        if not found_left:
            self.left_hand_missing_frames += 1
            if self.left_hand_missing_frames <= self.max_missing_frames and self.prev_left_landmarks:
                left_hand_data = {"landmarks": self.prev_left_landmarks, "wrist_quaternion": None}
                
        if not found_right:
            self.right_hand_missing_frames += 1
            if self.right_hand_missing_frames <= self.max_missing_frames and self.prev_right_landmarks:
                right_hand_data = {"landmarks": self.prev_right_landmarks, "wrist_quaternion": None}
                
        face_data = self.extract_face_data(face_results.face_landmarks[0]) if face_results.face_landmarks else None
        
        return {
            "timestamp": round(frame_idx / self.target_fps, 3),
            "body": body_data,
            "hands": {"left": left_hand_data, "right": right_hand_data},
            "face": face_data
        }

    def _apply_offline_smoothing(self, motion_frames: List[Dict]) -> List[Dict]:
        """
        MAGIC SAUCE: Zero-Phase Forward-Backward Smoothing.
        Destroys jitter completely without adding any lag.
        """
        alpha = 0.40  # Smoothing strength. 0.40 is perfect for zero-phase.

        def double_pass_smooth(landmark_series):
            # Forward pass
            fwd = []
            prev = None
            for lm in landmark_series:
                if not lm:
                    fwd.append(None)
                    prev = None
                elif not prev:
                    fwd.append(lm)
                    prev = lm
                else:
                    smoothed = [{"x": p["x"] + alpha * (c["x"] - p["x"]),
                                 "y": p["y"] + alpha * (c["y"] - p["y"]),
                                 "z": p["z"] + alpha * (c["z"] - p["z"])} 
                                for c, p in zip(lm, prev)]
                    fwd.append(smoothed)
                    prev = smoothed
                    
            # Backward pass
            bwd = []
            prev = None
            for lm in reversed(landmark_series):
                if not lm:
                    bwd.append(None)
                    prev = None
                elif not prev:
                    bwd.append(lm)
                    prev = lm
                else:
                    smoothed = [{"x": p["x"] + alpha * (c["x"] - p["x"]),
                                 "y": p["y"] + alpha * (c["y"] - p["y"]),
                                 "z": p["z"] + alpha * (c["z"] - p["z"])} 
                                for c, p in zip(lm, prev)]
                    bwd.append(smoothed)
                    prev = smoothed
            bwd.reverse()
            
            # Average the passes to cancel out latency
            final = []
            for f, b in zip(fwd, bwd):
                if f and b:
                    final.append([{"x": (f_i["x"] + b_i["x"]) / 2,
                                   "y": (f_i["y"] + b_i["y"]) / 2,
                                   "z": (f_i["z"] + b_i["z"]) / 2} 
                                  for f_i, b_i in zip(f, b)])
                else:
                    final.append(None)
            return final

        left_series = [f["hands"]["left"]["landmarks"] if f["hands"]["left"] else None for f in motion_frames]
        right_series = [f["hands"]["right"]["landmarks"] if f["hands"]["right"] else None for f in motion_frames]
        
        smooth_left = double_pass_smooth(left_series)
        smooth_right = double_pass_smooth(right_series)
        
        # Inject perfectly smooth data back in, and calculate exact wrist rotations
        for i, frame in enumerate(motion_frames):
            if smooth_left[i]:
                frame["hands"]["left"]["landmarks"] = smooth_left[i]
                frame["hands"]["left"]["wrist_quaternion"] = self._calculate_wrist_orientation(smooth_left[i], True)
            if smooth_right[i]:
                frame["hands"]["right"]["landmarks"] = smooth_right[i]
                frame["hands"]["right"]["wrist_quaternion"] = self._calculate_wrist_orientation(smooth_right[i], False)
                
        return motion_frames

    def extract_motion(self, video_path: str, gloss: str) -> Dict:
        if self.verbose:
            print(f"\n🎬 Processing: {gloss.upper()} | {video_path}")
            
        self.prev_left_landmarks, self.prev_right_landmarks = None, None
        self.left_hand_missing_frames, self.right_hand_missing_frames = 0, 0
        self.reset_landmarkers()
        
        cap, total_frames, duration, fps = self.load_video(video_path)
        frames = self.resample_frames(cap, total_frames, duration, fps)
        
        motion_frames = []
        for idx, (frame, ts_ms) in enumerate(frames):
            motion_frames.append(self.process_frame(frame, idx, timestamp_ms=ts_ms))
            if self.verbose and (idx + 1) % 10 == 0:
                print(f"   Processed {idx + 1}/{len(frames)} frames", end='\r')
                
        # --- APPLY ZERO PHASE SMOOTHING ---
        if self.verbose: print(f"\n   ✨ Applying offline zero-phase smoothing...")
        motion_frames = self._apply_offline_smoothing(motion_frames)
        
        if self.verbose: print(f"   ✅ Completed {len(motion_frames)} frames")
        
        return {
            "gloss": gloss,
            "fps": self.target_fps,
            "duration": round(duration, 3),
            "frame_count": len(motion_frames),
            "frames": motion_frames
        }
    
    def save_motion_data(self, motion_data: Dict, output_path: Path):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(motion_data, f, indent=2)
            
    def close(self):
        self.pose_landmarker.close()
        self.hand_landmarker.close()
        self.face_landmarker.close()

# ==========================================
# GOOD ENOUGH FALL BACK IMPLEMENTATION FOR NOW
# ==========================================
# """
# Motion Extractor for Sign Language Videos
# """

# import cv2
# import json
# import mediapipe as mp
# import numpy as np
# from pathlib import Path
# from typing import Dict, List, Optional, Tuple


# def convert_to_threejs_coords(landmark):
#     """Convert MediaPipe coords to Three.js (negate Z)."""
#     return (
#         float(landmark.x),
#         float(landmark.y),
#         float(-landmark.z)
#     )


# class MotionExtractor:
#     """Extracts motion data from sign language videos using MediaPipe."""
    
#     # MediaPipe pose landmark indices
#     LEFT_SHOULDER = 11
#     RIGHT_SHOULDER = 12
#     LEFT_ELBOW = 13
#     RIGHT_ELBOW = 14
#     LEFT_WRIST = 15
#     RIGHT_WRIST = 16
    
#     # Face landmark indices
#     UPPER_LIP = 13
#     LOWER_LIP = 14
#     MOUTH_LEFT = 61
#     MOUTH_RIGHT = 291
#     LEFT_EYEBROW_INNER = 70
#     LEFT_EYE_TOP = 159
#     RIGHT_EYEBROW_INNER = 300
#     RIGHT_EYE_TOP = 386
    
#     def __init__(self, target_fps: int = 30, verbose: bool = True):
#         self.target_fps = target_fps
#         self.verbose = verbose
#         self._init_landmarkers()
        
#         # State tracking for smoothing and occlusion
#         self.prev_left_landmarks = None
#         self.prev_right_landmarks = None
#         self.left_hand_missing_frames = 0
#         self.right_hand_missing_frames = 0
        
#         # --- TUNING PARAMETERS ---
#         self.smoothing_alpha = 0.45  # 0.0 to 1.0 (Lower = smoother, Higher = more responsive)
#         self.max_missing_frames = 5  # Hold hand position for up to 5 frames (~160ms) if lost
    
#     def _init_landmarkers(self):
#         """Initialize MediaPipe landmarkers."""
#         pose_model = self._download_model('pose')
#         pose_options = mp.tasks.vision.PoseLandmarkerOptions(
#             base_options=mp.tasks.BaseOptions(model_asset_path=pose_model),
#             running_mode=mp.tasks.vision.RunningMode.VIDEO,
#             min_pose_detection_confidence=0.5,
#             min_pose_presence_confidence=0.5,
#             min_tracking_confidence=0.5,
#             output_segmentation_masks=False
#         )
#         self.pose_landmarker = mp.tasks.vision.PoseLandmarker.create_from_options(pose_options)
        
#         hand_model = self._download_model('hand')
#         hand_options = mp.tasks.vision.HandLandmarkerOptions(
#             base_options=mp.tasks.BaseOptions(model_asset_path=hand_model),
#             running_mode=mp.tasks.vision.RunningMode.VIDEO,
#             num_hands=2,
#             min_hand_detection_confidence=0.5,
#             min_hand_presence_confidence=0.5,
#             min_tracking_confidence=0.5
#         )
#         self.hand_landmarker = mp.tasks.vision.HandLandmarker.create_from_options(hand_options)
        
#         face_model = self._download_model('face')
#         face_options = mp.tasks.vision.FaceLandmarkerOptions(
#             base_options=mp.tasks.BaseOptions(model_asset_path=face_model),
#             running_mode=mp.tasks.vision.RunningMode.VIDEO,
#             min_face_detection_confidence=0.5,
#             min_face_presence_confidence=0.5,
#             min_tracking_confidence=0.5,
#             output_face_blendshapes=False,
#             output_facial_transformation_matrixes=False
#         )
#         self.face_landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(face_options)
    
#     def _download_model(self, model_type: str) -> str:
#         """Download MediaPipe model if needed."""
#         import urllib.request
        
#         model_urls = {
#             'pose': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task',
#             'hand': 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
#             'face': 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'
#         }
        
#         model_names = {
#             'pose': 'pose_landmarker_heavy.task',
#             'hand': 'hand_landmarker.task',
#             'face': 'face_landmarker.task'
#         }
        
#         model_path = Path.home() / ".mediapipe" / model_names[model_type]
#         model_path.parent.mkdir(parents=True, exist_ok=True)
        
#         if not model_path.exists():
#             if self.verbose:
#                 print(f"📥 Downloading MediaPipe {model_type} model...")
#             urllib.request.urlretrieve(model_urls[model_type], model_path)
        
#         return str(model_path)
    
#     def reset_landmarkers(self):
#         """Reset for new video (fixes timestamp issues)."""
#         self.pose_landmarker.close()
#         self.hand_landmarker.close()
#         self.face_landmarker.close()
#         self._init_landmarkers()
    
#     def load_video(self, video_path: str) -> Tuple[cv2.VideoCapture, int, float, float]:
#         """Load video and extract metadata."""
#         cap = cv2.VideoCapture(video_path)
#         if not cap.isOpened():
#             raise ValueError(f"Failed to open video: {video_path}")
        
#         total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
#         fps = cap.get(cv2.CAP_PROP_FPS)
#         duration = total_frames / fps if fps > 0 else 0
        
#         return cap, total_frames, duration, fps
    
#     def resample_frames(self, cap: cv2.VideoCapture, total_frames: int, 
#                         duration: float, orig_fps: float) -> List[Tuple[np.ndarray, int]]:
#         """Resample video to target FPS."""
#         target_frame_count = int(duration * self.target_fps)
#         frame_indices = np.linspace(0, total_frames - 1, target_frame_count, dtype=int)
        
#         frames = []
#         current_idx = 0
        
#         for target_idx in frame_indices:
#             while current_idx <= target_idx:
#                 ret, frame = cap.read()
#                 if not ret:
#                     break
#                 if current_idx == target_idx:
#                     timestamp_ms = int((len(frames) + 1) * (1000 / self.target_fps))
#                     frames.append((frame, timestamp_ms))
#                 current_idx += 1
        
#         cap.release()
        
#         if self.verbose:
#             print(f"   Resampled {len(frames)} frames at {self.target_fps}fps")
        
#         return frames
    
#     def extract_body_data(self, pose_landmarks) -> Optional[Dict]:
#         """Extract body joint positions and quaternion rotations."""
#         if not pose_landmarks:
#             return None
        
#         landmarks = pose_landmarks if isinstance(pose_landmarks, list) else pose_landmarks
        
#         # Convert positions to Three.js coords
#         left_shoulder = convert_to_threejs_coords(landmarks[self.LEFT_SHOULDER])
#         left_elbow = convert_to_threejs_coords(landmarks[self.LEFT_ELBOW])
#         left_wrist = convert_to_threejs_coords(landmarks[self.LEFT_WRIST])
#         right_shoulder = convert_to_threejs_coords(landmarks[self.RIGHT_SHOULDER])
#         right_elbow = convert_to_threejs_coords(landmarks[self.RIGHT_ELBOW])
#         right_wrist = convert_to_threejs_coords(landmarks[self.RIGHT_WRIST])
        
#         def direction_to_quat(direction: np.ndarray) -> Dict[str, float]:
#             """Calculate quaternion from +Y axis to target direction."""
#             eps = 1e-8
            
#             dir_norm = np.linalg.norm(direction)
#             if dir_norm < eps:
#                 return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
            
#             direction = direction / dir_norm
#             bone_forward = np.array([0.0, 1.0, 0.0])
            
#             axis = np.cross(bone_forward, direction)
#             axis_length = np.linalg.norm(axis)
            
#             if axis_length < eps:
#                 dot = np.dot(bone_forward, direction)
#                 if dot > 0:
#                     return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
#                 else:
#                     return {"x": 1.0, "y": 0.0, "z": 0.0, "w": 0.0}
            
#             axis = axis / axis_length
#             dot = np.clip(np.dot(bone_forward, direction), -1.0, 1.0)
#             angle = np.arccos(dot)
            
#             half_angle = angle / 2.0
#             sin_half = np.sin(half_angle)
            
#             return {
#                 "x": float(axis[0] * sin_half),
#                 "y": float(axis[1] * sin_half),
#                 "z": float(axis[2] * sin_half),
#                 "w": float(np.cos(half_angle))
#             }
        
#         # Calculate arm directions (already in Three.js coords from convert_to_threejs_coords)
#         left_upper_dir = np.array([
#             left_elbow[0] - left_shoulder[0],
#             left_elbow[1] - left_shoulder[1],
#             left_elbow[2] - left_shoulder[2]
#         ])
        
#         left_lower_dir = np.array([
#             left_wrist[0] - left_elbow[0],
#             left_wrist[1] - left_elbow[1],
#             left_wrist[2] - left_elbow[2]
#         ])
        
#         right_upper_dir = np.array([
#             right_elbow[0] - right_shoulder[0],
#             right_elbow[1] - right_shoulder[1],
#             right_elbow[2] - right_shoulder[2]
#         ])
        
#         right_lower_dir = np.array([
#             right_wrist[0] - right_elbow[0],
#             right_wrist[1] - right_elbow[1],
#             right_wrist[2] - right_elbow[2]
#         ])
        
#         return {
#             "left_shoulder": {"x": left_shoulder[0], "y": left_shoulder[1], "z": left_shoulder[2]},
#             "left_elbow": {"x": left_elbow[0], "y": left_elbow[1], "z": left_elbow[2]},
#             "left_wrist": {"x": left_wrist[0], "y": left_wrist[1], "z": left_wrist[2]},
#             "right_shoulder": {"x": right_shoulder[0], "y": right_shoulder[1], "z": right_shoulder[2]},
#             "right_elbow": {"x": right_elbow[0], "y": right_elbow[1], "z": right_elbow[2]},
#             "right_wrist": {"x": right_wrist[0], "y": right_wrist[1], "z": right_wrist[2]},
#             "left_shoulder_quat": direction_to_quat(left_upper_dir),
#             "left_elbow_quat": direction_to_quat(left_lower_dir),
#             "right_shoulder_quat": direction_to_quat(right_upper_dir),
#             "right_elbow_quat": direction_to_quat(right_lower_dir),
#         }

#     def extract_hand_data(self, hand_landmarks, hand_world_landmarks, handedness: str) -> Optional[Dict]:
#         """Export smoothed hand landmarks with wrist orientation."""
#         if not hand_world_landmarks:
#             return None
        
#         is_left = (handedness == 'left')
        
#         # 1. Convert world landmarks to Three.js coordinate system
#         current_landmarks = []
#         for lm in hand_world_landmarks:
#             current_landmarks.append({
#                 "x": float(lm.x),
#                 "y": float(-lm.y),  # Flip Y
#                 "z": float(-lm.z)   # Flip Z
#             })
        
#         # 2. Apply Exponential Moving Average (EMA) to smooth Z-depth noise
#         prev_landmarks = self.prev_left_landmarks if is_left else self.prev_right_landmarks
        
#         if prev_landmarks is not None:
#             smoothed_landmarks = []
#             for curr, prev in zip(current_landmarks, prev_landmarks):
#                 smoothed_landmarks.append({
#                     "x": prev["x"] + self.smoothing_alpha * (curr["x"] - prev["x"]),
#                     "y": prev["y"] + self.smoothing_alpha * (curr["y"] - prev["y"]),
#                     "z": prev["z"] + self.smoothing_alpha * (curr["z"] - prev["z"])
#                 })
#             current_landmarks = smoothed_landmarks

#         # 3. Update state memory
#         if is_left:
#             self.prev_left_landmarks = current_landmarks
#             self.left_hand_missing_frames = 0
#         else:
#             self.prev_right_landmarks = current_landmarks
#             self.right_hand_missing_frames = 0
        
#         # 4. Calculate wrist orientation using the SMOOTHED landmarks
#         wrist_quat = self._calculate_wrist_orientation(current_landmarks, is_left=is_left)
        
#         return {
#             "landmarks": current_landmarks,
#             "wrist_quaternion": wrist_quat
#         }

#     def _calculate_wrist_orientation(self, landmarks: List[Dict], is_left: bool) -> Dict[str, float]:
#             """
#             Calculate wrist quaternion from palm plane.
#             Builds an orthonormal frame with determinant check.
#             """
#             import numpy as np
            
#             wrist = np.array([landmarks[0]['x'], landmarks[0]['y'], landmarks[0]['z']])
#             index_mcp = np.array([landmarks[5]['x'], landmarks[5]['y'], landmarks[5]['z']])
#             middle_mcp = np.array([landmarks[9]['x'], landmarks[9]['y'], landmarks[9]['z']])
#             pinky_mcp = np.array([landmarks[17]['x'], landmarks[17]['y'], landmarks[17]['z']])
#             ring_mcp = np.array([landmarks[13]['x'], landmarks[13]['y'], landmarks[13]['z']])
            
#             palm_center = (index_mcp + middle_mcp + ring_mcp + pinky_mcp) / 4.0
            
#             # === Primary axis: Y = forward (wrist toward fingers) ===
#             forward = palm_center - wrist
#             forward_len = np.linalg.norm(forward)
#             if forward_len < 1e-8:
#                 return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
#             forward = forward / forward_len
            
#             # === Secondary axis: palm normal ===
#             vec_to_index = index_mcp - wrist
#             vec_to_pinky = pinky_mcp - wrist
            
#             # Cross product for palm normal — always compute the same way,
#             # then flip based on handedness for consistency
#             raw_normal = np.cross(vec_to_index, vec_to_pinky)
#             normal_len = np.linalg.norm(raw_normal)
#             if normal_len < 1e-8:
#                 return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
#             raw_normal = raw_normal / normal_len
            
#             # For left hand, flip normal so it points out of the palm (toward viewer when palm faces camera)
#             # For right hand, the cross product already points the right way
#             if is_left:
#                 palm_normal = -raw_normal
#             else:
#                 palm_normal = raw_normal
            
#             # === Gram-Schmidt orthogonalization (prioritize forward) ===
#             # Remove component of palm_normal along forward
#             palm_normal = palm_normal - np.dot(palm_normal, forward) * forward
#             pn_len = np.linalg.norm(palm_normal)
#             if pn_len < 1e-8:
#                 return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
#             palm_normal = palm_normal / pn_len
            
#             # Right vector completes the orthonormal basis
#             right = np.cross(forward, palm_normal)
#             right_len = np.linalg.norm(right)
#             if right_len < 1e-8:
#                 return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
#             right = right / right_len
            
#             # === Build rotation matrix ===
#             # Columns: X=right, Y=forward (along fingers), Z=palm_normal (out of palm)
#             rot_matrix = np.array([
#                 [right[0], forward[0], palm_normal[0]],
#                 [right[1], forward[1], palm_normal[1]],
#                 [right[2], forward[2], palm_normal[2]]
#             ])
            
#             # === CRITICAL: Verify proper rotation (det = +1) ===
#             det = np.linalg.det(rot_matrix)
#             if det < 0:
#                 # Flip the least-constrained axis (right) to fix reflection
#                 rot_matrix[:, 0] = -rot_matrix[:, 0]
            
#             # Verify it's close to a proper rotation
#             det = np.linalg.det(rot_matrix)
#             if abs(det - 1.0) > 0.1:
#                 return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
            
#             return self._matrix_to_quaternion(rot_matrix)    

#     def _matrix_to_quaternion(self, m: np.ndarray) -> Dict[str, float]:
#         """Convert 3x3 rotation matrix to quaternion."""
#         import numpy as np
        
#         trace = m[0, 0] + m[1, 1] + m[2, 2]
        
#         if trace > 0:
#             s = 0.5 / np.sqrt(trace + 1.0)
#             w = 0.25 / s
#             x = (m[2, 1] - m[1, 2]) * s
#             y = (m[0, 2] - m[2, 0]) * s
#             z = (m[1, 0] - m[0, 1]) * s
#         elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
#             s = 2.0 * np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2])
#             w = (m[2, 1] - m[1, 2]) / s
#             x = 0.25 * s
#             y = (m[0, 1] + m[1, 0]) / s
#             z = (m[0, 2] + m[2, 0]) / s
#         elif m[1, 1] > m[2, 2]:
#             s = 2.0 * np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2])
#             w = (m[0, 2] - m[2, 0]) / s
#             x = (m[0, 1] + m[1, 0]) / s
#             y = 0.25 * s
#             z = (m[1, 2] + m[2, 1]) / s
#         else:
#             s = 2.0 * np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1])
#             w = (m[1, 0] - m[0, 1]) / s
#             x = (m[0, 2] + m[2, 0]) / s
#             y = (m[1, 2] + m[2, 1]) / s
#             z = 0.25 * s
        
#         # Normalize
#         length = np.sqrt(x*x + y*y + z*z + w*w)
#         if length < 1e-8:
#             return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
        
#         return {
#             "x": float(x / length),
#             "y": float(y / length),
#             "z": float(z / length),
#             "w": float(w / length)
#         }

#     def extract_face_data(self, face_landmarks) -> Optional[Dict]:
#         """Extract facial blendshapes."""
#         if not face_landmarks:
#             return None
        
#         landmarks = face_landmarks if isinstance(face_landmarks, list) else face_landmarks
        
#         def calc_distance(lm1, lm2, min_d: float, max_d: float) -> float:
#             dist = np.sqrt((lm2.x - lm1.x)**2 + (lm2.y - lm1.y)**2 + (lm2.z - lm1.z)**2)
#             if max_d - min_d < 1e-8:
#                 return 0.0
#             return np.clip((dist - min_d) / (max_d - min_d), 0.0, 1.0)
        
#         return {
#             "jawOpen": calc_distance(landmarks[self.UPPER_LIP], landmarks[self.LOWER_LIP], 0.01, 0.08),
#             "mouthSmile": calc_distance(landmarks[self.MOUTH_LEFT], landmarks[self.MOUTH_RIGHT], 0.05, 0.10),
#             "eyeBrowRaise_L": calc_distance(landmarks[self.LEFT_EYE_TOP], landmarks[self.LEFT_EYEBROW_INNER], 0.03, 0.05),
#             "eyeBrowRaise_R": calc_distance(landmarks[self.RIGHT_EYE_TOP], landmarks[self.RIGHT_EYEBROW_INNER], 0.03, 0.05)
#         }

#     def process_frame(self, frame: np.ndarray, frame_idx: int, timestamp_ms: int) -> Dict:
#         """Process single frame with MediaPipe."""
#         rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
#         mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        
#         pose_results = self.pose_landmarker.detect_for_video(mp_image, timestamp_ms)
#         hand_results = self.hand_landmarker.detect_for_video(mp_image, timestamp_ms)
#         face_results = self.face_landmarker.detect_for_video(mp_image, timestamp_ms)
        
#         body_data = None
#         if pose_results.pose_world_landmarks:
#             body_data = self.extract_body_data(pose_results.pose_world_landmarks[0])
        
#         left_hand_data = None
#         right_hand_data = None
#         found_left = False
#         found_right = False
        
#         if hand_results.hand_landmarks and hand_results.hand_world_landmarks and hand_results.handedness:
#             for hand_lm, hand_world_lm, handedness in zip(
#                 hand_results.hand_landmarks, 
#                 hand_results.hand_world_landmarks,
#                 hand_results.handedness
#             ):
#                 hand_label = handedness[0].category_name.lower()
#                 hand_data = self.extract_hand_data(hand_lm, hand_world_lm, hand_label)
                
#                 if hand_label == 'left':
#                     left_hand_data = hand_data
#                     found_left = True
#                 elif hand_label == 'right':
#                     right_hand_data = hand_data
#                     found_right = True
        
#         # --- Fallback logic for dropped MediaPipe frames (Occlusion) ---
#         if not found_left:
#             self.left_hand_missing_frames += 1
#             if self.left_hand_missing_frames <= self.max_missing_frames and self.prev_left_landmarks:
#                 left_hand_data = {
#                     "landmarks": self.prev_left_landmarks,
#                     "wrist_quaternion": self._calculate_wrist_orientation(self.prev_left_landmarks, is_left=True)
#                 }
        
#         if not found_right:
#             self.right_hand_missing_frames += 1
#             if self.right_hand_missing_frames <= self.max_missing_frames and self.prev_right_landmarks:
#                 right_hand_data = {
#                     "landmarks": self.prev_right_landmarks,
#                     "wrist_quaternion": self._calculate_wrist_orientation(self.prev_right_landmarks, is_left=False)
#                 }
                
#         face_data = None
#         if face_results.face_landmarks:
#             face_data = self.extract_face_data(face_results.face_landmarks[0])
        
#         return {
#             "timestamp": round(frame_idx / self.target_fps, 3),
#             "body": body_data,
#             "hands": {"left": left_hand_data, "right": right_hand_data},
#             "face": face_data
#         }
    
#     def extract_motion(self, video_path: str, gloss: str) -> Dict:
#         """Extract complete motion data from video."""
#         if self.verbose:
#             print(f"\n🎬 Processing: {gloss.upper()}")
#             print(f"   Video: {video_path}")
        
#         # Ensure trackers are cleared between videos
#         self.prev_left_landmarks = None
#         self.prev_right_landmarks = None
#         self.left_hand_missing_frames = 0
#         self.right_hand_missing_frames = 0
        
#         self.reset_landmarkers()
        
#         cap, total_frames, duration, fps = self.load_video(video_path)
        
#         if self.verbose:
#             print(f"   Original: {total_frames} frames at {fps:.2f}fps, {duration:.2f}s")
        
#         frames = self.resample_frames(cap, total_frames, duration, fps)
        
#         motion_frames = []
#         for idx, (frame, ts_ms) in enumerate(frames):
#             frame_data = self.process_frame(frame, idx, timestamp_ms=ts_ms)
#             motion_frames.append(frame_data)
            
#             if self.verbose and (idx + 1) % 10 == 0:
#                 print(f"   Processed {idx + 1}/{len(frames)} frames", end='\r')
        
#         if self.verbose:
#             print(f"   ✅ Completed {len(motion_frames)} frames")
        
#         return {
#             "gloss": gloss,
#             "fps": self.target_fps,
#             "duration": round(duration, 3),
#             "frame_count": len(motion_frames),
#             "frames": motion_frames
#         }
    
#     def save_motion_data(self, motion_data: Dict, output_path: Path):
#         """Save motion data to JSON file."""
#         output_path.parent.mkdir(parents=True, exist_ok=True)
#         with open(output_path, 'w', encoding='utf-8') as f:
#             json.dump(motion_data, f, indent=2)
#         if self.verbose:
#             print(f"   💾 Saved to: {output_path}")
    
#     def close(self):
#         """Release MediaPipe resources."""
#         self.pose_landmarker.close()
#         self.hand_landmarker.close()
#         self.face_landmarker.close()


# """
# Motion Extractor for Sign Language Videos
# """

# import cv2
# import json
# import mediapipe as mp
# import numpy as np
# from pathlib import Path
# from typing import Dict, List, Optional, Tuple


# def convert_to_threejs_coords(landmark):
#     """Convert MediaPipe coords to Three.js (negate Z)."""
#     return (
#         float(landmark.x),
#         float(landmark.y),
#         float(-landmark.z)
#     )


# class MotionExtractor:
#     """Extracts motion data from sign language videos using MediaPipe."""
    
#     # MediaPipe pose landmark indices
#     LEFT_SHOULDER = 11
#     RIGHT_SHOULDER = 12
#     LEFT_ELBOW = 13
#     RIGHT_ELBOW = 14
#     LEFT_WRIST = 15
#     RIGHT_WRIST = 16
    
#     # Face landmark indices
#     UPPER_LIP = 13
#     LOWER_LIP = 14
#     MOUTH_LEFT = 61
#     MOUTH_RIGHT = 291
#     LEFT_EYEBROW_INNER = 70
#     LEFT_EYE_TOP = 159
#     RIGHT_EYEBROW_INNER = 300
#     RIGHT_EYE_TOP = 386
    
#     def __init__(self, target_fps: int = 30, verbose: bool = True):
#         self.target_fps = target_fps
#         self.verbose = verbose
#         self._init_landmarkers()
        
#         self.prev_left_hand = None
#         self.prev_right_hand = None
#         self.left_hand_missing_frames = 0
#         self.right_hand_missing_frames = 0
    
#     def _init_landmarkers(self):
#         """Initialize MediaPipe landmarkers."""
#         pose_model = self._download_model('pose')
#         pose_options = mp.tasks.vision.PoseLandmarkerOptions(
#             base_options=mp.tasks.BaseOptions(model_asset_path=pose_model),
#             running_mode=mp.tasks.vision.RunningMode.VIDEO,
#             min_pose_detection_confidence=0.5,
#             min_pose_presence_confidence=0.5,
#             min_tracking_confidence=0.5,
#             output_segmentation_masks=False
#         )
#         self.pose_landmarker = mp.tasks.vision.PoseLandmarker.create_from_options(pose_options)
        
#         hand_model = self._download_model('hand')
#         hand_options = mp.tasks.vision.HandLandmarkerOptions(
#             base_options=mp.tasks.BaseOptions(model_asset_path=hand_model),
#             running_mode=mp.tasks.vision.RunningMode.VIDEO,
#             num_hands=2,
#             min_hand_detection_confidence=0.5,
#             min_hand_presence_confidence=0.5,
#             min_tracking_confidence=0.5
#         )
#         self.hand_landmarker = mp.tasks.vision.HandLandmarker.create_from_options(hand_options)
        
#         face_model = self._download_model('face')
#         face_options = mp.tasks.vision.FaceLandmarkerOptions(
#             base_options=mp.tasks.BaseOptions(model_asset_path=face_model),
#             running_mode=mp.tasks.vision.RunningMode.VIDEO,
#             min_face_detection_confidence=0.5,
#             min_face_presence_confidence=0.5,
#             min_tracking_confidence=0.5,
#             output_face_blendshapes=False,
#             output_facial_transformation_matrixes=False
#         )
#         self.face_landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(face_options)
    
#     def _download_model(self, model_type: str) -> str:
#         """Download MediaPipe model if needed."""
#         import urllib.request
        
#         model_urls = {
#             'pose': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task',
#             'hand': 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
#             'face': 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'
#         }
        
#         model_names = {
#             'pose': 'pose_landmarker_heavy.task',
#             'hand': 'hand_landmarker.task',
#             'face': 'face_landmarker.task'
#         }
        
#         model_path = Path.home() / ".mediapipe" / model_names[model_type]
#         model_path.parent.mkdir(parents=True, exist_ok=True)
        
#         if not model_path.exists():
#             if self.verbose:
#                 print(f"📥 Downloading MediaPipe {model_type} model...")
#             urllib.request.urlretrieve(model_urls[model_type], model_path)
        
#         return str(model_path)
    
#     def reset_landmarkers(self):
#         """Reset for new video (fixes timestamp issues)."""
#         self.pose_landmarker.close()
#         self.hand_landmarker.close()
#         self.face_landmarker.close()
#         self._init_landmarkers()
    
#     def load_video(self, video_path: str) -> Tuple[cv2.VideoCapture, int, float, float]:
#         """Load video and extract metadata."""
#         cap = cv2.VideoCapture(video_path)
#         if not cap.isOpened():
#             raise ValueError(f"Failed to open video: {video_path}")
        
#         total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
#         fps = cap.get(cv2.CAP_PROP_FPS)
#         duration = total_frames / fps if fps > 0 else 0
        
#         return cap, total_frames, duration, fps
    
#     def resample_frames(self, cap: cv2.VideoCapture, total_frames: int, 
#                         duration: float, orig_fps: float) -> List[Tuple[np.ndarray, int]]:
#         """Resample video to target FPS."""
#         target_frame_count = int(duration * self.target_fps)
#         frame_indices = np.linspace(0, total_frames - 1, target_frame_count, dtype=int)
        
#         frames = []
#         current_idx = 0
        
#         for target_idx in frame_indices:
#             while current_idx <= target_idx:
#                 ret, frame = cap.read()
#                 if not ret:
#                     break
#                 if current_idx == target_idx:
#                     timestamp_ms = int((len(frames) + 1) * (1000 / self.target_fps))
#                     frames.append((frame, timestamp_ms))
#                 current_idx += 1
        
#         cap.release()
        
#         if self.verbose:
#             print(f"   Resampled {len(frames)} frames at {self.target_fps}fps")
        
#         return frames
    
#     def extract_body_data(self, pose_landmarks) -> Optional[Dict]:
#         """Extract body joint positions and quaternion rotations."""
#         if not pose_landmarks:
#             return None
        
#         landmarks = pose_landmarks if isinstance(pose_landmarks, list) else pose_landmarks
        
#         # Convert positions to Three.js coords
#         left_shoulder = convert_to_threejs_coords(landmarks[self.LEFT_SHOULDER])
#         left_elbow = convert_to_threejs_coords(landmarks[self.LEFT_ELBOW])
#         left_wrist = convert_to_threejs_coords(landmarks[self.LEFT_WRIST])
#         right_shoulder = convert_to_threejs_coords(landmarks[self.RIGHT_SHOULDER])
#         right_elbow = convert_to_threejs_coords(landmarks[self.RIGHT_ELBOW])
#         right_wrist = convert_to_threejs_coords(landmarks[self.RIGHT_WRIST])
        
#         def direction_to_quat(direction: np.ndarray) -> Dict[str, float]:
#             """Calculate quaternion from +Y axis to target direction."""
#             eps = 1e-8
            
#             dir_norm = np.linalg.norm(direction)
#             if dir_norm < eps:
#                 return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
            
#             direction = direction / dir_norm
#             bone_forward = np.array([0.0, 1.0, 0.0])
            
#             axis = np.cross(bone_forward, direction)
#             axis_length = np.linalg.norm(axis)
            
#             if axis_length < eps:
#                 dot = np.dot(bone_forward, direction)
#                 if dot > 0:
#                     return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
#                 else:
#                     return {"x": 1.0, "y": 0.0, "z": 0.0, "w": 0.0}
            
#             axis = axis / axis_length
#             dot = np.clip(np.dot(bone_forward, direction), -1.0, 1.0)
#             angle = np.arccos(dot)
            
#             half_angle = angle / 2.0
#             sin_half = np.sin(half_angle)
            
#             return {
#                 "x": float(axis[0] * sin_half),
#                 "y": float(axis[1] * sin_half),
#                 "z": float(axis[2] * sin_half),
#                 "w": float(np.cos(half_angle))
#             }
        
#         # Calculate arm directions (already in Three.js coords from convert_to_threejs_coords)
#         left_upper_dir = np.array([
#             left_elbow[0] - left_shoulder[0],
#             left_elbow[1] - left_shoulder[1],
#             left_elbow[2] - left_shoulder[2]
#         ])
        
#         left_lower_dir = np.array([
#             left_wrist[0] - left_elbow[0],
#             left_wrist[1] - left_elbow[1],
#             left_wrist[2] - left_elbow[2]
#         ])
        
#         right_upper_dir = np.array([
#             right_elbow[0] - right_shoulder[0],
#             right_elbow[1] - right_shoulder[1],
#             right_elbow[2] - right_shoulder[2]
#         ])
        
#         right_lower_dir = np.array([
#             right_wrist[0] - right_elbow[0],
#             right_wrist[1] - right_elbow[1],
#             right_wrist[2] - right_elbow[2]
#         ])
        
#         return {
#             "left_shoulder": {"x": left_shoulder[0], "y": left_shoulder[1], "z": left_shoulder[2]},
#             "left_elbow": {"x": left_elbow[0], "y": left_elbow[1], "z": left_elbow[2]},
#             "left_wrist": {"x": left_wrist[0], "y": left_wrist[1], "z": left_wrist[2]},
#             "right_shoulder": {"x": right_shoulder[0], "y": right_shoulder[1], "z": right_shoulder[2]},
#             "right_elbow": {"x": right_elbow[0], "y": right_elbow[1], "z": right_elbow[2]},
#             "right_wrist": {"x": right_wrist[0], "y": right_wrist[1], "z": right_wrist[2]},
#             "left_shoulder_quat": direction_to_quat(left_upper_dir),
#             "left_elbow_quat": direction_to_quat(left_lower_dir),
#             "right_shoulder_quat": direction_to_quat(right_upper_dir),
#             "right_elbow_quat": direction_to_quat(right_lower_dir),
#         }
    
#     def extract_hand_data(self, hand_landmarks, hand_world_landmarks, handedness: str) -> Optional[Dict]:
#         """
#         Export hand landmarks with wrist orientation.
        
#         Args:
#             hand_landmarks: Normalized image coordinates (used for 2D if needed)
#             hand_world_landmarks: 3D world coordinates in meters
#             handedness: 'left' or 'right'
#         """
#         if not hand_world_landmarks:
#             return None
        
#         # Convert world landmarks to Three.js coordinate system
#         landmarks_list = []
#         for lm in hand_world_landmarks:
#             landmarks_list.append({
#                 "x": float(lm.x),
#                 "y": float(-lm.y),  # Flip Y (MediaPipe Y+ is down, Three.js Y+ is up)
#                 "z": float(-lm.z)   # Flip Z for Three.js
#             })
        
#         # Calculate wrist orientation from palm geometry
#         wrist_quat = self._calculate_wrist_orientation(
#             landmarks_list, 
#             is_left=(handedness == 'left')
#         )
        
#         return {
#             "landmarks": landmarks_list,
#             "wrist_quaternion": wrist_quat
#         }

#     def _calculate_wrist_orientation(self, landmarks: List[Dict], is_left: bool) -> Dict[str, float]:
#             """
#             Calculate wrist quaternion from palm plane.
#             Builds an orthonormal frame with determinant check.
#             """
#             import numpy as np
            
#             wrist = np.array([landmarks[0]['x'], landmarks[0]['y'], landmarks[0]['z']])
#             index_mcp = np.array([landmarks[5]['x'], landmarks[5]['y'], landmarks[5]['z']])
#             middle_mcp = np.array([landmarks[9]['x'], landmarks[9]['y'], landmarks[9]['z']])
#             pinky_mcp = np.array([landmarks[17]['x'], landmarks[17]['y'], landmarks[17]['z']])
#             ring_mcp = np.array([landmarks[13]['x'], landmarks[13]['y'], landmarks[13]['z']])
            
#             palm_center = (index_mcp + middle_mcp + ring_mcp + pinky_mcp) / 4.0
            
#             # === Primary axis: Y = forward (wrist toward fingers) ===
#             forward = palm_center - wrist
#             forward_len = np.linalg.norm(forward)
#             if forward_len < 1e-8:
#                 return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
#             forward = forward / forward_len
            
#             # === Secondary axis: palm normal ===
#             vec_to_index = index_mcp - wrist
#             vec_to_pinky = pinky_mcp - wrist
            
#             # Cross product for palm normal — always compute the same way,
#             # then flip based on handedness for consistency
#             raw_normal = np.cross(vec_to_index, vec_to_pinky)
#             normal_len = np.linalg.norm(raw_normal)
#             if normal_len < 1e-8:
#                 return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
#             raw_normal = raw_normal / normal_len
            
#             # For left hand, flip normal so it points out of the palm (toward viewer when palm faces camera)
#             # For right hand, the cross product already points the right way
#             if is_left:
#                 palm_normal = -raw_normal
#             else:
#                 palm_normal = raw_normal
            
#             # === Gram-Schmidt orthogonalization (prioritize forward) ===
#             # Remove component of palm_normal along forward
#             palm_normal = palm_normal - np.dot(palm_normal, forward) * forward
#             pn_len = np.linalg.norm(palm_normal)
#             if pn_len < 1e-8:
#                 return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
#             palm_normal = palm_normal / pn_len
            
#             # Right vector completes the orthonormal basis
#             right = np.cross(forward, palm_normal)
#             right_len = np.linalg.norm(right)
#             if right_len < 1e-8:
#                 return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
#             right = right / right_len
            
#             # === Build rotation matrix ===
#             # Columns: X=right, Y=forward (along fingers), Z=palm_normal (out of palm)
#             rot_matrix = np.array([
#                 [right[0], forward[0], palm_normal[0]],
#                 [right[1], forward[1], palm_normal[1]],
#                 [right[2], forward[2], palm_normal[2]]
#             ])
            
#             # === CRITICAL: Verify proper rotation (det = +1) ===
#             det = np.linalg.det(rot_matrix)
#             if det < 0:
#                 # Flip the least-constrained axis (right) to fix reflection
#                 rot_matrix[:, 0] = -rot_matrix[:, 0]
            
#             # Verify it's close to a proper rotation
#             det = np.linalg.det(rot_matrix)
#             if abs(det - 1.0) > 0.1:
#                 return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
            
#             return self._matrix_to_quaternion(rot_matrix)    
#     # def _calculate_wrist_orientation(self, landmarks: List[Dict], is_left: bool) -> Dict[str, float]:
#     #     """
#     #     Calculate wrist quaternion from palm plane.
#     #     Uses the palm normal and finger direction to build a rotation matrix.
#     #     """
#     #     import numpy as np
        
#     #     # Key landmarks (indices from MediaPipe hand model)
#     #     wrist = np.array([landmarks[0]['x'], landmarks[0]['y'], landmarks[0]['z']])
#     #     index_mcp = np.array([landmarks[5]['x'], landmarks[5]['y'], landmarks[5]['z']])
#     #     middle_mcp = np.array([landmarks[9]['x'], landmarks[9]['y'], landmarks[9]['z']])
#     #     pinky_mcp = np.array([landmarks[17]['x'], landmarks[17]['y'], landmarks[17]['z']])
#     #     ring_mcp = np.array([landmarks[13]['x'], landmarks[13]['y'], landmarks[13]['z']])
        
#     #     # Calculate palm center (average of MCP joints)
#     #     palm_center = (index_mcp + middle_mcp + ring_mcp + pinky_mcp) / 4.0
        
#     #     # Forward direction: wrist to palm center (finger direction)
#     #     forward = palm_center - wrist
#     #     forward_len = np.linalg.norm(forward)
#     #     if forward_len < 1e-8:
#     #         return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
#     #     forward = forward / forward_len
        
#     #     # Palm vectors for normal calculation
#     #     vec_to_index = index_mcp - wrist
#     #     vec_to_pinky = pinky_mcp - wrist
        
#     #     # Palm normal (perpendicular to palm surface)
#     #     # Cross product order determines which side is "up"
#     #     if is_left:
#     #         palm_normal = np.cross(vec_to_pinky, vec_to_index)
#     #     else:
#     #         palm_normal = np.cross(vec_to_index, vec_to_pinky)
        
#     #     normal_len = np.linalg.norm(palm_normal)
#     #     if normal_len < 1e-8:
#     #         return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
#     #     palm_normal = palm_normal / normal_len
        
#     #     # Right vector (perpendicular to both forward and normal)
#     #     right = np.cross(forward, palm_normal)
#     #     right_len = np.linalg.norm(right)
#     #     if right_len < 1e-8:
#     #         return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
#     #     right = right / right_len
        
#     #     # Recalculate palm_normal to ensure orthogonality
#     #     palm_normal = np.cross(right, forward)
#     #     palm_normal = palm_normal / (np.linalg.norm(palm_normal) + 1e-8)
        
#     #     # Build rotation matrix (columns are the basis vectors)
#     #     # For RPM hands: X = right, Y = forward (along fingers), Z = palm normal
#     #     rot_matrix = np.array([
#     #         [right[0], forward[0], palm_normal[0]],
#     #         [right[1], forward[1], palm_normal[1]],
#     #         [right[2], forward[2], palm_normal[2]]
#     #     ])
        
#     #     # Convert rotation matrix to quaternion
#     #     return self._matrix_to_quaternion(rot_matrix)


#     def _matrix_to_quaternion(self, m: np.ndarray) -> Dict[str, float]:
#         """Convert 3x3 rotation matrix to quaternion."""
#         import numpy as np
        
#         trace = m[0, 0] + m[1, 1] + m[2, 2]
        
#         if trace > 0:
#             s = 0.5 / np.sqrt(trace + 1.0)
#             w = 0.25 / s
#             x = (m[2, 1] - m[1, 2]) * s
#             y = (m[0, 2] - m[2, 0]) * s
#             z = (m[1, 0] - m[0, 1]) * s
#         elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
#             s = 2.0 * np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2])
#             w = (m[2, 1] - m[1, 2]) / s
#             x = 0.25 * s
#             y = (m[0, 1] + m[1, 0]) / s
#             z = (m[0, 2] + m[2, 0]) / s
#         elif m[1, 1] > m[2, 2]:
#             s = 2.0 * np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2])
#             w = (m[0, 2] - m[2, 0]) / s
#             x = (m[0, 1] + m[1, 0]) / s
#             y = 0.25 * s
#             z = (m[1, 2] + m[2, 1]) / s
#         else:
#             s = 2.0 * np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1])
#             w = (m[1, 0] - m[0, 1]) / s
#             x = (m[0, 2] + m[2, 0]) / s
#             y = (m[1, 2] + m[2, 1]) / s
#             z = 0.25 * s
        
#         # Normalize
#         length = np.sqrt(x*x + y*y + z*z + w*w)
#         if length < 1e-8:
#             return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
        
#         return {
#             "x": float(x / length),
#             "y": float(y / length),
#             "z": float(z / length),
#             "w": float(w / length)
#         }

#     def extract_face_data(self, face_landmarks) -> Optional[Dict]:
#         """Extract facial blendshapes."""
#         if not face_landmarks:
#             return None
        
#         landmarks = face_landmarks if isinstance(face_landmarks, list) else face_landmarks
        
#         def calc_distance(lm1, lm2, min_d: float, max_d: float) -> float:
#             dist = np.sqrt((lm2.x - lm1.x)**2 + (lm2.y - lm1.y)**2 + (lm2.z - lm1.z)**2)
#             if max_d - min_d < 1e-8:
#                 return 0.0
#             return np.clip((dist - min_d) / (max_d - min_d), 0.0, 1.0)
        
#         return {
#             "jawOpen": calc_distance(landmarks[self.UPPER_LIP], landmarks[self.LOWER_LIP], 0.01, 0.08),
#             "mouthSmile": calc_distance(landmarks[self.MOUTH_LEFT], landmarks[self.MOUTH_RIGHT], 0.05, 0.10),
#             "eyeBrowRaise_L": calc_distance(landmarks[self.LEFT_EYE_TOP], landmarks[self.LEFT_EYEBROW_INNER], 0.03, 0.05),
#             "eyeBrowRaise_R": calc_distance(landmarks[self.RIGHT_EYE_TOP], landmarks[self.RIGHT_EYEBROW_INNER], 0.03, 0.05)
#         }
    
#     def process_frame(self, frame: np.ndarray, frame_idx: int, timestamp_ms: int) -> Dict:
#         """Process single frame with MediaPipe."""
#         rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
#         mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        
#         pose_results = self.pose_landmarker.detect_for_video(mp_image, timestamp_ms)
#         hand_results = self.hand_landmarker.detect_for_video(mp_image, timestamp_ms)
#         face_results = self.face_landmarker.detect_for_video(mp_image, timestamp_ms)
        
#         body_data = None
#         if pose_results.pose_world_landmarks:
#             body_data = self.extract_body_data(pose_results.pose_world_landmarks[0])
        
#         left_hand_data = None
#         right_hand_data = None
        
#         # Use WORLD landmarks for hands (critical for 3D orientation)
#         if hand_results.hand_landmarks and hand_results.hand_world_landmarks and hand_results.handedness:
#             for hand_lm, hand_world_lm, handedness in zip(
#                 hand_results.hand_landmarks, 
#                 hand_results.hand_world_landmarks,
#                 hand_results.handedness
#             ):
#                 hand_label = handedness[0].category_name.lower()
#                 hand_data = self.extract_hand_data(hand_lm, hand_world_lm, hand_label)
                
#                 if hand_label == 'left':
#                     left_hand_data = hand_data
#                 elif hand_label == 'right':
#                     right_hand_data = hand_data
        
#         face_data = None
#         if face_results.face_landmarks:
#             face_data = self.extract_face_data(face_results.face_landmarks[0])
        
#         return {
#             "timestamp": round(frame_idx / self.target_fps, 3),
#             "body": body_data,
#             "hands": {"left": left_hand_data, "right": right_hand_data},
#             "face": face_data
#         }
    
#     def extract_motion(self, video_path: str, gloss: str) -> Dict:
#         """Extract complete motion data from video."""
#         if self.verbose:
#             print(f"\n🎬 Processing: {gloss.upper()}")
#             print(f"   Video: {video_path}")
        
#         self.prev_left_hand = None
#         self.prev_right_hand = None
#         self.left_hand_missing_frames = 0
#         self.right_hand_missing_frames = 0
        
#         self.reset_landmarkers()
        
#         cap, total_frames, duration, fps = self.load_video(video_path)
        
#         if self.verbose:
#             print(f"   Original: {total_frames} frames at {fps:.2f}fps, {duration:.2f}s")
        
#         frames = self.resample_frames(cap, total_frames, duration, fps)
        
#         motion_frames = []
#         for idx, (frame, ts_ms) in enumerate(frames):
#             frame_data = self.process_frame(frame, idx, timestamp_ms=ts_ms)
#             motion_frames.append(frame_data)
            
#             if self.verbose and (idx + 1) % 10 == 0:
#                 print(f"   Processed {idx + 1}/{len(frames)} frames", end='\r')
        
#         if self.verbose:
#             print(f"   ✅ Completed {len(motion_frames)} frames")
        
#         return {
#             "gloss": gloss,
#             "fps": self.target_fps,
#             "duration": round(duration, 3),
#             "frame_count": len(motion_frames),
#             "frames": motion_frames
#         }
    
#     def save_motion_data(self, motion_data: Dict, output_path: Path):
#         """Save motion data to JSON file."""
#         output_path.parent.mkdir(parents=True, exist_ok=True)
#         with open(output_path, 'w', encoding='utf-8') as f:
#             json.dump(motion_data, f, indent=2)
#         if self.verbose:
#             print(f"   💾 Saved to: {output_path}")
    
#     def close(self):
#         """Release MediaPipe resources."""
#         self.pose_landmarker.close()
#         self.hand_landmarker.close()
#         self.face_landmarker.close()