"""
Utility functions for motion capture calculations.

Contains helper functions for:
- Euler angle calculations from 3D landmarks
- Finger curl calculations using dot product
- Face blendshape calculations from landmark distances
"""

import numpy as np
from typing import Tuple, Optional, Dict


def calculate_quaternion_from_direction(direction: np.ndarray, up_hint: Optional[np.ndarray] = None) -> Dict[str, float]:
    """
    Calculate quaternion that rotates from +X axis to the given direction.
    
    Args:
        direction: Target direction vector (will be normalized)
        up_hint: Optional hint for 'up' direction to resolve rotation ambiguity
        
    Returns:
        Dict with quaternion components {x, y, z, w}
    """
    eps = 1e-8

    # Guard: zero-length direction => identity rotation
    dir_norm = np.linalg.norm(direction)
    if dir_norm < eps:
        return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}

    # Normalize direction
    direction = direction / dir_norm

    # Default bone forward is +X axis in most humanoid rigs
    bone_forward = np.array([1.0, 0.0, 0.0])

    # Calculate rotation axis (cross product)
    axis = np.cross(bone_forward, direction)
    axis_length = np.linalg.norm(axis)

    # Handle parallel vectors (no rotation needed or 180° flip)
    if axis_length < 1e-6:
        dot = np.dot(bone_forward, direction)
        if dot > 0:  # Same direction
            return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
        else:  # Opposite direction (180° rotation)
            # Use up_hint or pick a stable axis orthogonal to bone_forward
            if up_hint is not None and np.linalg.norm(up_hint) > eps:
                axis = up_hint / (np.linalg.norm(up_hint) + eps)
            else:
                # Choose Y axis unless it's parallel to bone_forward, then Z
                test_axis = np.array([0.0, 1.0, 0.0])
                if abs(np.dot(test_axis, bone_forward)) > 0.9:
                    test_axis = np.array([0.0, 0.0, 1.0])
                axis = test_axis / (np.linalg.norm(test_axis) + eps)

            # 180° rotation quaternion (axis must be normalized)
            quat = {"x": float(axis[0]), "y": float(axis[1]), "z": float(axis[2]), "w": 0.0}
            return normalize_quat_dict(quat)

    axis = axis / axis_length

    # Calculate rotation angle
    dot = np.clip(np.dot(bone_forward, direction), -1.0, 1.0)
    angle = np.arccos(dot)

    # Convert axis-angle to quaternion
    half_angle = angle / 2.0
    sin_half = np.sin(half_angle)

    quat = {
        "x": float(axis[0] * sin_half),
        "y": float(axis[1] * sin_half),
        "z": float(axis[2] * sin_half),
        "w": float(np.cos(half_angle))
    }

    return normalize_quat_dict(quat)

def calculate_quaternion_from_direction_rpm(
    direction: np.ndarray, 
    is_left_side: bool = False,
    is_elbow: bool = False
) -> Dict[str, float]:
    """
    Calculate quaternion for Ready Player Me skeleton.
    Uses +Y as bone forward axis.
    
    Args:
        direction: Target direction vector (already in Three.js coords with Z negated)
        is_left_side: Unused - kept for API compatibility
        is_elbow: Unused - kept for API compatibility
        
    Returns:
        Dict with quaternion components {x, y, z, w}
    """
    eps = 1e-8
    
    dir_norm = np.linalg.norm(direction)
    if dir_norm < eps:
        return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
    
    direction = direction / dir_norm
    
    # RPM arm bones point along +Y axis
    bone_forward = np.array([0.0, 1.0, 0.0])
    
    axis = np.cross(bone_forward, direction)
    axis_length = np.linalg.norm(axis)
    
    if axis_length < eps:
        dot = np.dot(bone_forward, direction)
        if dot > 0:
            return {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
        else:
            return {"x": 1.0, "y": 0.0, "z": 0.0, "w": 0.0}
    
    axis = axis / axis_length
    
    dot = np.clip(np.dot(bone_forward, direction), -1.0, 1.0)
    angle = np.arccos(dot)
    
    half_angle = angle / 2.0
    sin_half = np.sin(half_angle)
    
    x = float(axis[0] * sin_half)
    y = float(axis[1] * sin_half)
    z = float(axis[2] * sin_half)
    w = float(np.cos(half_angle))
    
    return normalize_quat_dict({"x": x, "y": y, "z": z, "w": w})

def normalize_quat_dict(q: Dict[str, float]) -> Dict[str, float]:
    """
    Normalize a quaternion represented as a dict to unit length.

    Args:
        q: Dict with keys 'x','y','z','w'

    Returns:
        Normalized quaternion dict with float components.
    """
    arr = np.array([q.get('x', 0.0), q.get('y', 0.0), q.get('z', 0.0), q.get('w', 1.0)], dtype=float)
    n = np.linalg.norm(arr) + 1e-12
    arr = arr / n
    return {"x": float(arr[0]), "y": float(arr[1]), "z": float(arr[2]), "w": float(arr[3])}


def quat_rotate_vector(q: Dict[str, float], v: np.ndarray) -> np.ndarray:
    """
    Rotate a 3D vector `v` by quaternion `q` (dict form).

    Uses the formula: v' = v + 2.0 * cross(q_vec, cross(q_vec, v) + q_w * v)

    Args:
        q: Quaternion dict {x,y,z,w}
        v: 3-vector to rotate

    Returns:
        Rotated 3-vector as numpy array
    """
    qx, qy, qz, qw = q['x'], q['y'], q['z'], q['w']
    q_vec = np.array([qx, qy, qz], dtype=float)
    t = 2.0 * np.cross(q_vec, v)
    rotated = v + qw * t + np.cross(q_vec, t)
    return rotated


def quat_multiply(a: Dict[str, float], b: Dict[str, float]) -> Dict[str, float]:
    """
    Multiply two quaternions (Hamilton product): a * b

    Args:
        a, b: quaternion dicts {x,y,z,w}

    Returns:
        Quaternion dict representing a*b
    """
    ax, ay, az, aw = a['x'], a['y'], a['z'], a['w']
    bx, by, bz, bw = b['x'], b['y'], b['z'], b['w']

    x = aw * bx + ax * bw + ay * bz - az * by
    y = aw * by - ax * bz + ay * bw + az * bx
    z = aw * bz + ax * by - ay * bx + az * bw
    w = aw * bw - ax * bx - ay * by - az * bz

    return normalize_quat_dict({"x": float(x), "y": float(y), "z": float(z), "w": float(w)})


def quat_inverse(q: Dict[str, float]) -> Dict[str, float]:
    """
    Inverse (conjugate) of a unit quaternion.

    Args:
        q: quaternion dict {x,y,z,w}

    Returns:
        Inverse quaternion dict
    """
    # For unit quaternions, inverse is conjugate
    return normalize_quat_dict({"x": -q['x'], "y": -q['y'], "z": -q['z'], "w": q['w']})


def calculate_wrist_quaternion(wrist, index_mcp, middle_mcp, pinky_mcp) -> Dict[str, float]:
    """
    Calculate wrist rotation quaternion from hand plane.
    
    Args:
        wrist: Wrist landmark
        index_mcp: Index finger knuckle
        middle_mcp: Middle finger knuckle
        pinky_mcp: Pinky finger knuckle
        
    Returns:
        Dict with quaternion components {x, y, z, w}
    """
    # Calculate palm vectors
    v1 = np.array([index_mcp.x - wrist.x, index_mcp.y - wrist.y, index_mcp.z - wrist.z])
    v2 = np.array([pinky_mcp.x - wrist.x, pinky_mcp.y - wrist.y, pinky_mcp.z - wrist.z])
    
    # Palm normal (perpendicular to palm surface)
    palm_normal = np.cross(v1, v2)
    palm_normal = palm_normal / (np.linalg.norm(palm_normal) + 1e-8)
    
    # Forward direction (toward middle finger)
    forward = np.array([middle_mcp.x - wrist.x, middle_mcp.y - wrist.y, middle_mcp.z - wrist.z])
    forward = forward / (np.linalg.norm(forward) + 1e-8)
    
    # Calculate quaternion from forward direction with palm normal as up
    return calculate_quaternion_from_direction(forward, palm_normal)


def calculate_joint_angle(point_a, point_b, point_c) -> float:
    """
    Calculate ROTATION angle at point_b formed by point_a -> point_b -> point_c.
    Returns rotation angle needed to bend the joint.
    
    Args:
        point_a: First landmark point with x, y, z attributes
        point_b: Middle landmark point (joint) with x, y, z attributes
        point_c: End landmark point with x, y, z attributes
        
    Returns:
        Rotation angle in degrees (0° = straight, 90° = bent 90°, 180° = fully bent back)
    """
    # Create vectors
    ba = np.array([point_a.x - point_b.x, 
                   point_a.y - point_b.y,
                   point_a.z - point_b.z])
    bc = np.array([point_c.x - point_b.x,
                   point_c.y - point_b.y,
                   point_c.z - point_b.z])
    
    # Dot product and magnitudes
    cosine_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
    inter_bone_angle = np.arccos(np.clip(cosine_angle, -1.0, 1.0))
    inter_bone_deg = np.degrees(inter_bone_angle)
    
    # Convert from inter-bone angle to rotation angle
    # 180° inter-bone = 0° rotation (straight)
    # 90° inter-bone = 90° rotation (bent)
    rotation_angle = 180.0 - inter_bone_deg
    
    return rotation_angle


def calculate_euler_angles(shoulder, elbow, wrist) -> Tuple[float, float, float]:
    """
    Calculate Euler angles (yaw, pitch, roll) for arm rotation.
    Uses Tait-Bryan z-y-x convention.
    
    Args:
        shoulder: Shoulder landmark with x, y, z attributes
        elbow: Elbow landmark with x, y, z attributes
        wrist: Wrist landmark with x, y, z attributes
        
    Returns:
        Tuple of (yaw, pitch, roll) in degrees
    """
    # Direction vector from shoulder to elbow
    dx = elbow.x - shoulder.x
    dy = elbow.y - shoulder.y
    dz = elbow.z - shoulder.z
    
    # Yaw (rotation around z-axis)
    yaw = np.arctan2(dy, dx)
    
    # Pitch (rotation around y-axis)
    pitch = np.arctan2(-dz, np.sqrt(dx**2 + dy**2) + 1e-8)
    
    # Roll (rotation around x-axis) - simplified
    # For more accurate roll, would need additional reference point
    roll = 0.0
    
    return np.degrees(yaw), np.degrees(pitch), np.degrees(roll)


def calculate_finger_curl(mcp, pip, dip, tip) -> float:
    """
    Calculate finger curl/bend as normalized value using dot product method.
    
    Args:
        mcp: Metacarpophalangeal joint (knuckle)
        pip: Proximal interphalangeal joint
        dip: Distal interphalangeal joint
        tip: Fingertip
        
    Returns:
        Curl value: 0.0 = fully extended, 1.0 = fully curled
    """
    # Vector from MCP to PIP
    v1 = np.array([pip.x - mcp.x, pip.y - mcp.y, pip.z - mcp.z])
    # Vector from DIP to TIP
    v2 = np.array([tip.x - dip.x, tip.y - dip.y, tip.z - dip.z])
    
    # Normalize
    v1_norm = np.linalg.norm(v1)
    v2_norm = np.linalg.norm(v2)
    
    if v1_norm < 1e-8 or v2_norm < 1e-8:
        return 0.0
    
    v1 = v1 / v1_norm
    v2 = v2 / v2_norm
    
    # Dot product gives cosine of angle
    dot = np.dot(v1, v2)
    
    # Map from [-1, 1] to [0, 1]
    # dot = 1 (0°) = straight = 0.0 curl
    # dot = -1 (180°) = bent = 1.0 curl
    curl = (1.0 - dot) / 2.0
    
    return np.clip(curl, 0.0, 1.0)


def calculate_finger_joint_angles(base, mcp, pip, dip, tip) -> dict:
    """
    Calculate individual joint angles for each bone segment of a finger.
    Returns rotation angles for MCP, PIP, and DIP joints.
    
    Args:
        base: Base/palm landmark (for thumb: CMC, for others: knuckle base)
        mcp: Metacarpophalangeal joint
        pip: Proximal interphalangeal joint
        dip: Distal interphalangeal joint
        tip: Fingertip
        
    Returns:
        Dict with 'mcp', 'pip', 'dip' angles in degrees (0-180)
    """
    # MCP joint angle (base -> mcp -> pip)
    mcp_angle = calculate_joint_angle(base, mcp, pip)
    
    # PIP joint angle (mcp -> pip -> dip)
    pip_angle = calculate_joint_angle(mcp, pip, dip)
    
    # DIP joint angle (pip -> dip -> tip)
    dip_angle = calculate_joint_angle(pip, dip, tip)
    
    return {
        'mcp': mcp_angle,
        'pip': pip_angle,
        'dip': dip_angle
    }


def calculate_blendshape_from_distance(landmark1, landmark2, 
                                       min_distance: float, 
                                       max_distance: float) -> float:
    """
    Calculate blendshape value from distance between two landmarks.
    
    Args:
        landmark1: First landmark with x, y, z attributes
        landmark2: Second landmark with x, y, z attributes
        min_distance: Distance at minimum blendshape (0.0)
        max_distance: Distance at maximum blendshape (1.0)
        
    Returns:
        Blendshape value normalized to [0.0, 1.0]
    """
    # Calculate Euclidean distance
    distance = np.sqrt(
        (landmark2.x - landmark1.x)**2 + 
        (landmark2.y - landmark1.y)**2 + 
        (landmark2.z - landmark1.z)**2
    )
    
    # Normalize to 0-1 range
    if max_distance - min_distance < 1e-8:
        return 0.0
    
    blendshape = (distance - min_distance) / (max_distance - min_distance)
    return np.clip(blendshape, 0.0, 1.0)


def convert_to_threejs_coords(landmark) -> Tuple[float, float, float]:
    """
    Convert MediaPipe world coordinates to Three.js coordinate system.
    MediaPipe: Right-handed, Y-up, Z away from camera (-)
    Three.js: Right-handed, Y-up, Z toward viewer (+)
    
    Args:
        landmark: Landmark with x, y, z attributes (in meters)
        
    Returns:
        Tuple of (x, y, z) in Three.js coordinates
    """
    return (
        float(landmark.x),   # X: Right (+) / Left (-)
        float(landmark.y),   # Y: Up (+) / Down (-)
        float(-landmark.z)   # Z: Negate for Three.js (toward viewer +)
    )


def exponential_decay_interpolate(current_value: Optional[dict], 
                                  previous_value: Optional[dict], 
                                  decay_factor: float = 0.8) -> Optional[dict]:
    """
    Apply exponential decay interpolation for missing hand detections.
    
    Args:
        current_value: Current frame value (None if missing)
        previous_value: Previous frame value (dict or None)
        decay_factor: Decay multiplier (default 0.8)
        
    Returns:
        Interpolated value or None if no previous data
    """
    if current_value is not None:
        return current_value
    
    if previous_value is None:
        return None
    
    # Apply decay to all numeric values in dict
    decayed = {}
    for key, value in previous_value.items():
        if isinstance(value, (int, float)):
            decayed[key] = value * decay_factor
        else:
            decayed[key] = value
    
    return decayed
