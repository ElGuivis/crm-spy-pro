import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const logger = createLogger('AuthContext');

interface Profile {
  id: string;
  user_id: string;
  company_name: string | null;
  avatar_url: string | null;
  active_tenant_id: string | null;
}

interface Tenant {
  id: string;
  owner_id: string;
  name: string;
}

interface UserTenant {
  tenant_id: string;
  tenant_name: string;
  role: string;
}

// All module_permission enum values
const ALL_PERMISSIONS = [
  'dashboard', 'sales', 'clients', 'conversations', 'automations',
  'integrations', 'settings', 'coupons', 'products', 'contacts', 'tenants'
] as const;

type ModulePermission = typeof ALL_PERMISSIONS[number];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  tenant: Tenant | null;
  tenantId: string | null;
  loading: boolean;
  permissions: ModulePermission[];
  /** All tenants the user has access to */
  availableTenants: UserTenant[];
  /** Whether the user has access to more than one tenant */
  isMultiTenant: boolean;
  /** Switch to a different tenant. Returns true on success. */
  switchTenant: (tenantId: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, companyName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  /**
   * NOTE: isOwner and isAdmin are for UI/UX purposes only.
   * Actual security is enforced by Row Level Security (RLS) policies
   * and server-side functions (is_tenant_admin, has_module_permission).
   * Never rely solely on these client-side flags for security decisions.
   */
  isOwner: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState<ModulePermission[]>([]);
  const [availableTenants, setAvailableTenants] = useState<UserTenant[]>([]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          resetState();
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const resetState = () => {
    setProfile(null);
    setTenant(null);
    setIsOwner(false);
    setIsAdmin(false);
    setPermissions([]);
    setAvailableTenants([]);
    setLoading(false);
  };

  const fetchUserData = async (userId: string) => {
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, user_id, owner_name, avatar_url, company_name, active_tenant_id, onboarding_completed, checklist_dismissed, notification_prefs, created_at, updated_at')
        .eq('user_id', userId)
        .single();
      
      if (profileData) {
        setProfile(profileData as unknown as Profile);
      }

      // Fetch all tenants the user has access to
      const { data: userTenants } = await supabase.rpc('get_user_tenants', { _user_id: userId });
      const tenantsList: UserTenant[] = (userTenants as UserTenant[]) || [];
      setAvailableTenants(tenantsList);

      // Resolve active tenant using the DB function (respects active_tenant_id)
      const { data: activeTenantId } = await supabase.rpc('get_user_tenant_id', { _user_id: userId });

      let tenantData: Tenant | null = null;
      if (activeTenantId) {
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('id, name, owner_id, created_at, updated_at')
          .eq('id', activeTenantId)
          .maybeSingle();
        tenantData = tenantRow;
      }

      if (tenantData) {
        setTenant(tenantData);
        setIsOwner(tenantData.owner_id === userId);
      }

      // Check role and permissions for the active tenant
      await resolvePermissions(userId, tenantData);
    } catch (error) {
      logger.error('Error fetching user data', error);
    } finally {
      setLoading(false);
    }
  };

  const resolvePermissions = async (userId: string, tenantData: Tenant | null) => {
    // Owner check: user owns the active tenant — no team_members record needed
    const ownerFlag = tenantData?.owner_id === userId;

    if (ownerFlag) {
      // Owners always have full access — no need to query team_members
      setIsOwner(true);
      setIsAdmin(true);
      setPermissions([...ALL_PERMISSIONS]);
      return;
    }

    // Check team membership for the ACTIVE tenant specifically
    const { data: teamMemberData } = await supabase
      .from('team_members')
      .select('id, role')
      .eq('user_id', userId)
      .eq('tenant_id', tenantData?.id ?? '')
      .maybeSingle();

    const adminFlag = teamMemberData?.role === 'admin' || teamMemberData?.role === 'owner';

    setIsAdmin(adminFlag);
    setIsOwner(false);

    if (adminFlag) {
      setPermissions([...ALL_PERMISSIONS]);
    } else if (teamMemberData) {
      const { data: memberPerms } = await supabase
        .from('member_permissions')
        .select('permission')
        .eq('team_member_id', teamMemberData.id)
        .eq('can_view', true);
      
      if (memberPerms && memberPerms.length > 0) {
        setPermissions(memberPerms.map(p => p.permission as ModulePermission));
      } else {
        setPermissions([]);
      }
    } else {
      // No team membership and not owner — grant all only if no tenantData context
      setPermissions(tenantData ? [] : [...ALL_PERMISSIONS]);
    }
  };

  const switchTenant = useCallback(async (newTenantId: string): Promise<boolean> => {
    if (!user) return false;

    // Call server-side function that validates access before updating
    const { data: success } = await supabase.rpc('set_active_tenant', {
      _user_id: user.id,
      _tenant_id: newTenantId,
    });

    if (!success) return false;

    // Reload all user data for the new tenant
    setLoading(true);
    await fetchUserData(user.id);
    return true;
  }, [user]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, companyName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          company_name: companyName,
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    resetState();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        tenant,
        tenantId: tenant?.id ?? null,
        loading,
        permissions,
        availableTenants,
        isMultiTenant: availableTenants.length > 1,
        switchTenant,
        signIn,
        signUp,
        signOut,
        isOwner,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
