//! Works out the mpv playlist commands needed to move from what is loaded to
//! what the agent wants, without interrupting the item on screen when it is
//! still part of the new playlist.

use crate::agent::Item;

pub const DEFAULT_IMAGE_SECONDS: u32 = 10;
const MAX_IMAGE_SECONDS: u32 = 86_400;

#[derive(Debug, Clone, PartialEq)]
pub enum Op {
    /// `playlist-clear`: drop every entry except the one playing.
    ClearOthers,
    /// `loadfile <path> replace`: start this item now.
    Replace(Item),
    /// `loadfile <path> append`.
    Append(Item),
    /// Stop playback and empty the playlist.
    Stop,
}

/// Identity of a playlist entry as mpv sees it. Two entries with the same key
/// play identically, so a change in path or image duration counts as new.
pub fn key(item: &Item) -> String {
    format!(
        "{}|{}|{}|{}",
        item.id,
        item.asset_id,
        item.local_path,
        image_seconds(item)
    )
}

pub fn image_seconds(item: &Item) -> u32 {
    item.duration_seconds
        .unwrap_or(DEFAULT_IMAGE_SECONDS)
        .clamp(1, MAX_IMAGE_SECONDS)
}

/// Returns None when `desired` is already loaded.
///
/// `current` is the key of the entry on screen, if any. When it is still in
/// the new playlist it keeps playing and the rest is queued after it in
/// playlist order (mpv loops the playlist, so a rotation plays the same
/// sequence). Otherwise playback restarts at `start_item_id` when given
/// (resuming where the screen left off before a restart) or the first item.
pub fn plan(
    current: Option<&str>,
    applied: &[Item],
    desired: &[Item],
    start_item_id: Option<&str>,
) -> Option<Vec<Op>> {
    let unchanged = applied.len() == desired.len()
        && applied.iter().zip(desired).all(|(a, b)| key(a) == key(b));
    if unchanged && !(desired.is_empty() && current.is_some()) {
        return None;
    }
    if desired.is_empty() {
        return Some(vec![Op::Stop]);
    }

    if let Some(index) =
        current.and_then(|current| desired.iter().position(|item| key(item) == current))
    {
        let mut ops = vec![Op::ClearOthers];
        ops.extend(rotation(desired, index).skip(1).cloned().map(Op::Append));
        return Some(ops);
    }

    let start = if applied.is_empty() {
        start_item_id
            .and_then(|id| desired.iter().position(|item| item.id == id))
            .unwrap_or(0)
    } else {
        0
    };
    let mut entries = rotation(desired, start).cloned();
    let mut ops = vec![Op::Replace(entries.next().expect("desired is not empty"))];
    ops.extend(entries.map(Op::Append));
    Some(ops)
}

fn rotation(items: &[Item], start: usize) -> impl Iterator<Item = &Item> {
    items[start..].iter().chain(items[..start].iter())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str) -> Item {
        Item {
            id: id.into(),
            asset_id: format!("asset-{id}"),
            asset_type: "video".into(),
            title: id.into(),
            local_path: format!("/cache/{id}.mp4"),
            duration_seconds: None,
        }
    }

    fn ids(ops: &[Op]) -> Vec<String> {
        ops.iter()
            .map(|op| match op {
                Op::ClearOthers => "clear".to_string(),
                Op::Replace(item) => format!("replace:{}", item.id),
                Op::Append(item) => format!("append:{}", item.id),
                Op::Stop => "stop".to_string(),
            })
            .collect()
    }

    #[test]
    fn first_load_starts_at_resume_item() {
        let desired = vec![item("a"), item("b"), item("c")];
        let ops = plan(None, &[], &desired, Some("b")).unwrap();
        assert_eq!(ids(&ops), ["replace:b", "append:c", "append:a"]);
    }

    #[test]
    fn unchanged_playlist_needs_nothing() {
        let desired = vec![item("a"), item("b")];
        assert!(plan(Some(&key(&desired[0])), &desired, &desired, None).is_none());
    }

    #[test]
    fn growing_playlist_keeps_current_item_playing() {
        let applied = vec![item("a"), item("b")];
        let desired = vec![item("a"), item("b"), item("c")];
        let ops = plan(Some(&key(&applied[1])), &applied, &desired, None).unwrap();
        assert_eq!(ids(&ops), ["clear", "append:c", "append:a"]);
    }

    #[test]
    fn removed_current_item_restarts_from_the_top() {
        let applied = vec![item("a"), item("b")];
        let desired = vec![item("c"), item("a")];
        let ops = plan(Some(&key(&applied[1])), &applied, &desired, Some("a")).unwrap();
        assert_eq!(ids(&ops), ["replace:c", "append:a"]);
    }

    #[test]
    fn changed_image_duration_counts_as_a_new_entry() {
        let mut image = item("a");
        image.asset_type = "image".into();
        let mut longer = image.clone();
        longer.duration_seconds = Some(30);
        let ops = plan(Some(&key(&image)), &[image.clone()], &[longer], None).unwrap();
        assert_eq!(ids(&ops), ["replace:a"]);
    }

    #[test]
    fn empty_playlist_stops_playback() {
        let applied = vec![item("a")];
        assert_eq!(
            plan(Some(&key(&applied[0])), &applied, &[], None).unwrap(),
            vec![Op::Stop]
        );
        assert!(plan(None, &[], &[], None).is_none());
    }

    #[test]
    fn image_duration_is_clamped() {
        let mut image = item("a");
        image.duration_seconds = Some(0);
        assert_eq!(image_seconds(&image), 1);
        image.duration_seconds = None;
        assert_eq!(image_seconds(&image), DEFAULT_IMAGE_SECONDS);
    }
}
