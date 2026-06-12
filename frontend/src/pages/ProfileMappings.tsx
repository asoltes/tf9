import Shell from '../Shell';
import ProfileMappingsEditor from '../components/ProfileMappingsEditor';
import './ConfigYaml.css';

export default function ProfileMappingsPage() {
  return (
    <Shell>
      <div className="config-page">
        <div className="page-head">
          <div>
            <div className="page-title">CLI Directory to Profile Mappings</div>
            <div className="page-desc">
              Map directory base names to AWS profiles. Used by{' '}
              <code>tf9 plan --recursive or tf9 plan -R --skip prod-euw2</code>{' '}
              when scanning child terraform directories from a parent folder.
              The directory's base name must match a key exactly (e.g. <code>dev</code>, <code>qa</code>, <code>prod</code>).
              Overridden by <code>--profile</code>.
            </div>
          </div>
        </div>

        <div className="container">
          <div className="c-head">
            <div>
              <div className="c-title">Directory to profile mappings</div>
              <div className="c-desc">
                Each row maps an exact directory base name to an AWS CLI profile.
              </div>
            </div>
          </div>
          <ProfileMappingsEditor />
        </div>
      </div>
    </Shell>
  );
}
