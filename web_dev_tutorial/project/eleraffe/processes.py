import time
import random


def run_loach_process(image_path):
    time.sleep(2)
    options = ["", "an elephant", "a giraffe", "neither an elephant nor a giraffe"]
    choice = random.choice(options)

    if not choice:
        raise RuntimeError("Program error: rats in the server room again")
    
    result = f"This is {choice}"
    return result
